# Agent Flow 模块技术设计文档

## 1. 架构设计

### 1.1 整体架构

采用与 agent-flow 类似的**事件驱动 + Canvas 2D 渲染**架构：

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AgentFlowView                                  │
│  ┌─────────────────────────────────┐  ┌───────────────────────────┐  │
│  │         AgentCanvas             │  │      ActivityLog           │  │
│  │     (Canvas 2D 渲染)           │  │    (播放日志列表)          │  │
│  └─────────────────────────────────┘  └───────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                       ControlBar                                 │  │
│  │                  (播放控制条)                                    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    useAgentSimulation (Hook)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ SimulationState   │  │ processEvent()   │  │ computeNextFrame()│ │
│  │ (状态容器)        │  │ (事件处理)        │  │ (动画帧计算)      │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CallGraphBuilder                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │ build_nodes()    │  │ build_layers()   │  │ build_chains()   │ │
│  │ (解析JSONL)      │  │ (层序遍历)        │  │ (构建调用链)     │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 模块职责划分

| 模块 | 职责 |
|------|------|
| `AgentFlowView` | 主容器组件，布局管理 |
| `AgentCanvas` | Canvas 2D 渲染器，动画循环 |
| `ActivityLog` | 右侧日志面板，显示播放的每行日志 |
| `ControlBar` | 播放控制条（播放/暂停/速度/进度） |
| `useAgentSimulation` | 仿真状态管理，事件处理，动画帧计算 |
| `CallGraphBuilder` | JSONL 解析，构建调用链图 |
| `simulation/*` | 事件处理器（agent/tool/message） |
| `canvas/*` | Canvas 绘制函数（节点/边/粒子/背景） |

### 1.3 核心数据结构

**核心概念：虚拟节点 vs 画布节点**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        虚拟节点 (VirtualNode)                          │
│  - 对应 Python Node                                                   │
│  - 按 uuid/parentUuid 构建树结构                                      │
│  - 用于确定调用链路顺序                                                │
│  - 不存在于画布上                                                     │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼  每个 VirtualNode 包含
┌─────────────────────────────────────────────────────────────────────┐
│                        EntityNode (画布节点)                              │
│  - 存在于画布上                                                       │
│  - 唯一标识: entity_id                                                │
│  - 按 findToolSlot 算法排列位置                                        │
│  - 同一 VirtualNode 的多个 EntityNode 紧凑排列                            │
└─────────────────────────────────────────────────────────────────────┘
```

```typescript
// 虚拟节点 - 对应 Python Node（不存在于画布）
interface VirtualNode {
  uuid: string                          // 日志条目 UUID
  role: 'assistant' | 'user' | 'system'
  contentType: ContentType
  toolName?: string
  parentUuid: string | null             // 父节点 UUID
  subNodes: EntityNode[]                  // 包含的画布节点
  callLinks: CallLink[]                // 产生的边
}

// ContentType 枚举
type ContentType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image'

// 画布节点 - 对应 Python EntityNode（存在于画布）
interface EntityNode {
  entityType: 'user' | 'main_agent' | 'assistant' | 'tool'
  entityId: string                    // 唯一标识: "0", "1", "2", "call_xxx"
  displayName: string
}

// 画布边 - 对应 Python CallLink
interface CanvasEdge {
  id: string                          // `${source}-${target}`
  source: string                       // entity_id
  target: string                       // entity_id
  type: LinkType
  opacity: number
  particles: Particle[]
}

// 粒子
interface Particle {
  id: string
  edgeId: string
  progress: number                     // 0-1 沿路径位置
  type: 'dispatch' | 'return' | 'tool_call' | 'tool_return' | 'thinking'
  color: string
  size: number
  trailLength: number
}
```

**LinkType 枚举**:

```typescript
type LinkType =
  | 'thinking'       // 2 → 2 自调用（画圆弧）
  | 'agent_call'     // 2 → 1
  | 'tool_call'       // 1 → call_xxx
  | 'tool_result'    // call_xxx → 1
  | 'agent_result'   // 1 → 2
  | 'user_input'     // 0 → 1
  | 'agent_receive'  // 1 → 2
  | 'agent_response' // 2 → 1
  | 'response'       // 1 → 0
```

### 1.4 层级定义

**层级 = 按 parentUuid 树结构层序遍历**

```
虚拟节点树:
  根节点 (parentUuid = null)
    │
    ├── 第1层: parentUuid = 根节点.uuid
    │     │
    │     └── 第2层: parentUuid = 第1层节点.uuid
    │           │
    │           └── 第3层: ...
```

**遍历规则**:
1. 按层序遍历虚拟节点树
2. 每个虚拟节点根据其 `callLinks` 产生画布边
3. 画布节点（EntityNode）按 `findToolSlot` 算法排列位置
4. 同一虚拟节点的多个 EntityNode 紧凑排列

**层级结构**:

```typescript
interface Layer {
  level: number              // 层级编号
  nodes: VirtualNode[]       // 该层级的虚拟节点
}

interface CallGraph {
  virtualNodes: Map<string, VirtualNode>   // uuid → VirtualNode
  layers: Layer[]
  subNodes: Map<string, EntityNode>          // entityId → EntityNode (画布节点)
  callLinks: CallLink[]                    // 所有边
}
```

### 1.5 仿真状态

```typescript
interface SimulationState {
  // 画布节点 - EntityNode
  nodes: Map<string, EntityNode>              // entity_id → EntityNode
  // 节点运行时状态
  nodeStates: Map<string, NodeState>        // entity_id → 运行时状态（位置、透明度等）
  // 边
  edges: Map<string, CanvasEdge>           // edgeId → edge
  // 粒子
  particles: Particle[]
  // 当前时间
  currentTime: number
  // 播放状态
  isPlaying: boolean
  speed: number
  // 事件索引
  eventIndex: number
  // 事件队列（从 CallGraphBuilder 构建）
  eventQueue: SimulationEvent[]
  // 已播放的日志条目
  playedEntries: PlayedEntry[]
}

interface NodeState {
  x: number
  y: number
  opacity: number
  scale: number
  state: 'idle' | 'thinking' | 'tool_calling' | 'complete' | 'error'
}

interface PlayedEntry {
  index: number
  timestamp: number
  type: string
  content: string
}

interface SimulationEvent {
  time: number
  type: 'node_spawn' | 'edge_create' | 'particle_dispatch'
  payload: Record<string, unknown>
}
```

---

## 2. 技术选型

### 2.1 渲染方案对比

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| React Flow | 生态丰富，易于上手 | 定制受限，性能一般 | ~~原有方案~~ |
| Canvas 2D | 性能高，定制灵活，可实现复杂效果 | 需要手写更多渲染逻辑 | **新方案** |

**结论**: 采用 Canvas 2D 渲染，参考 agent-flow 的实现。

### 2.2 动画方案对比

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| Framer Motion | 声明式，API 友好 | 适用于 React 组件，不适合 Canvas | ~~辅助~~ |
| requestAnimationFrame | 精确控制，性能高 | 需要手动管理 | **主方案** |

**结论**: 采用 `requestAnimationFrame` 驱动动画循环。

### 2.3 依赖项

| 依赖 | 用途 | 版本 |
|------|------|------|
| `react` | UI 框架 | 18.x |
| `zustand` | 状态管理（已有） | 5.x |
| `d3-force` | 力导向布局（已有） | 7.x |

**无需新增依赖** - 项目已有 `zustand`，Canvas 2D API 为原生。

---

## 3. 核心流程设计

### 3.1 数据流

```
JSONL 文件
    │
    ▼
CallGraphBuilder.build_call_graph()
    │
    ├── build_nodes()      ──→ 按 content 逐条解析，构建 Node[]
    ├── build_layers()     ──→ 按 parentUuid 层序遍历，构建层级
    └── build_chains()     ──→ 构建 CallLink[]
    │
    ▼
SimulationEvent[] (事件队列)
    │
    ▼
useAgentSimulation.processEvent()
    │
    ├── handleNodeSpawn()  ──→ 创建/复用 EntityNode
    ├── handleEdgeCreate() ──→ 创建 CanvasEdge
    └── handleParticleDispatch() ──→ 创建 Particle
    │
    ▼
SimulationState (状态)
    │
    ▼
AgentCanvas.computeNextFrame()
    │
    ├── animateNodes()     ──→ 节点淡入淡出
    ├── animateEdges()     ──→ 边透明度
    ├── animateParticles() ──→ 粒子沿路径移动
    └── animateDiscoveries() ──→ 发现物动画
    │
    ▼
Canvas 渲染
```

### 3.2 节点位置计算

**核心算法: findToolSlot (参考 agent-flow)**

```typescript
// 带位置的节点（用于布局计算）
interface PositionedNode {
  entityId: string
  x: number
  y: number
  parentId: string | null
}

function findToolSlot(
  agent: PositionedNode,
  existingNodes: Map<string, PositionedNode>,
  existingTools: Map<string, PositionedNode>,
): { x: number; y: number } {
  // 1. 计算出口方向
  let outAngle = -Math.PI / 2  // 默认向上
  if (agent.parentId) {
    const parent = existingNodes.get(agent.parentId)
    if (parent) {
      outAngle = Math.atan2(agent.y - parent.y, agent.x - parent.x)
    }
  }

  // 2. 在出口方向的扇形区域内搜索
  // 多圈同心圆搜索，避开已占用的位置
  for (let ring = 1; ring <= MAX_RINGS; ring++) {
    const dist = BASE_DISTANCE + ring * RING_INCREMENT
    const steps = BASE_STEPS + ring * STEPS_PER_RING
    for (let i = 0; i < steps; i++) {
      const sweep = (i / (steps - 1) - 0.5) * Math.PI
      const angle = outAngle + sweep
      const x = agent.x + Math.cos(angle) * dist
      const y = agent.y + Math.sin(angle) * dist
      if (!overlaps(x, y, existingNodes, existingTools)) {
        return { x, y }
      }
    }
  }

  // 3. 兜底：直接放在出口方向最远处
  return {
    x: agent.x + Math.cos(outAngle) * FALLBACK_DISTANCE,
    y: agent.y + Math.sin(outAngle) * FALLBACK_DISTANCE,
  }
}
```

### 3.3 自调用（Thinking）圆弧

当 `source === target` 时，画一个指向自己的贝塞尔圆弧：

```typescript
function drawSelfLoop(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  radius: number,
  color: string
) {
  ctx.beginPath()
  ctx.arc(x, y - radius, radius, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.stroke()

  // 画箭头
  drawArrow(ctx, x + radius, y - radius * 2, ...)
}
```

### 3.4 布局常量

```typescript
const LAYOUT = {
  // 节点大小
  NODE_RADIUS_MAIN: 28,
  NODE_RADIUS_SUB: 20,

  // Tool 位置
  TOOL_SLOT: {
    baseDistance: 120,
    ringIncrement: 60,
    baseSteps: 8,
    stepsPerRing: 4,
    maxRings: 3,
    fallbackDistance: 300,
  },

  // 边
  BEAM: {
    curvature: 0.15,
    parentChild: { startW: 3, endW: 1 },
    tool: { startW: 1.5, endW: 0.5 },
  },
}
```

---

## 4. 数据模型设计

### 4.1 类型定义

**文件: `src/types/agentCanvas.ts`**

类型定义与 1.3 节保持一致：

```typescript
// EntityNode = 画布节点
// VirtualNode = 虚拟节点（用于构建调用链）
// LinkType = 边类型
// Particle = 粒子
// SimulationState = 仿真状态
// SimulationEvent = 仿真事件

export type NodeType = 'user' | 'main_agent' | 'assistant' | 'tool'

export interface EntityNode {
  entityType: NodeType
  entityId: string
  displayName: string
}

export interface NodeState {
  x: number
  y: number
  opacity: number
  scale: number
  state: 'idle' | 'thinking' | 'tool_calling' | 'complete' | 'error'
}

export type LinkType =
  | 'thinking' | 'agent_call' | 'tool_call' | 'tool_result'
  | 'agent_result' | 'user_input' | 'agent_receive'
  | 'agent_response' | 'response'

export interface CanvasEdge {
  id: string
  source: string
  target: string
  type: LinkType
  opacity: number
}

export interface Particle {
  id: string
  edgeId: string
  progress: number
  type: 'dispatch' | 'return' | 'tool_call' | 'tool_return' | 'thinking'
  color: string
  size: number
  trailLength: number
  label?: string
}

export interface SimulationEvent {
  time: number
  type: 'node_spawn' | 'edge_create' | 'particle_dispatch'
  payload: {
    nodeId?: string
    edgeId?: string
    particle?: Particle
    nodeType?: NodeType
    displayName?: string
    linkType?: LinkType
    source?: string
    target?: string
  }
}

export interface SimulationState {
  nodes: Map<string, EntityNode>
  nodeStates: Map<string, NodeState>
  edges: Map<string, CanvasEdge>
  particles: Particle[]
  currentTime: number
  isPlaying: boolean
  speed: number
  eventIndex: number
  eventQueue: SimulationEvent[]
  playedEntries: PlayedEntry[]
}

export interface PlayedEntry {
  index: number
  timestamp: number
  type: string
  content: string
}
```
```

### 4.2 颜色定义

**文件: `src/components/AgentFlowView/colors.ts`**

```typescript
export const COLORS = {
  // 背景
  void: '#050510',
  hexGrid: '#0d0d1f',

  // 节点
  mainAgent: '#00f0ff',
  assistant: '#a855f7',
  user: '#22c55e',
  tool: '#ff8c00',

  // 状态
  idle: '#00f0ff',
  thinking: '#a855f7',
  toolCalling: '#ff8c00',
  complete: '#00ff88',
  error: '#ff4444',

  // 边/粒子
  dispatch: '#cc88ff',
  return: '#66ffaa',
  message: '#00f0ff',
}
```

---

## 5. 组件设计

### 5.1 AgentFlowView

```
src/components/AgentFlowView/
├── index.tsx                 # 主容器
├── AgentCanvas.tsx           # Canvas 渲染器
├── ActivityLog.tsx           # 右侧日志面板
├── ControlBar.tsx            # 播放控制条
├── colors.ts                 # 颜色常量
├── simulation/
│   ├── index.ts             # useAgentSimulation hook
│   ├── types.ts             # 仿真类型
│   ├── animate.ts           # 动画计算
│   ├── call-graph.ts        # CallGraphBuilder
│   └── handlers/
│       ├── node-handlers.ts  # 节点事件处理
│       ├── edge-handlers.ts  # 边事件处理
│       └── particle-handlers.ts
└── canvas/
    ├── index.ts             # 绘制入口
    ├── draw-background.ts    # 背景绘制
    ├── draw-nodes.ts         # 节点绘制
    ├── draw-edges.ts         # 边绘制
    ├── draw-particles.ts     # 粒子绘制
    ├── draw-self-loop.ts     # 自调用圆弧
    └── bloom.ts              # Bloom 后处理
```

### 5.2 组件接口

**AgentFlowView**
```typescript
interface AgentFlowViewProps {
  data: ParsedLogData | null
}
```

**AgentCanvas**
```typescript
interface AgentCanvasProps {
  simulationState: SimulationState
  onNodeClick?: (nodeId: string) => void
  onEdgeClick?: (edgeId: string) => void
}
```

**ActivityLog**
```typescript
interface ActivityLogProps {
  entries: PlayedEntry[]
}
```

**ControlBar**
```typescript
interface ControlBarProps {
  isPlaying: boolean
  speed: number
  currentTime: number
  totalTime: number
  onPlayPause: () => void
  onRestart: () => void
  onSpeedChange: (speed: number) => void
  onSeek: (time: number) => void
}
```

---

## 6. 关键算法

### 6.1 CallGraphBuilder (TypeScript 版)

```typescript
class CallGraphBuilder {
  private nodes: Map<string, Node> = new Map()
  private layers: Layer[] = []
  private callChains: CallChain[] = []

  buildCallGraph(records: LogEntry[]): SimulationEvent[] {
    this.buildNodes(records)
    this.buildLayers()
    this.buildChains()
    return this.generateEvents()
  }

  private buildNodes(records: LogEntry[]) {
    for (const record of records) {
      const content = record.message?.content
      if (!Array.isArray(content)) continue

      for (const item of content) {
        const node = this.createNode(record, item)
        if (node) {
          this.nodes.set(node.uuid, node)
        }
      }
    }
  }

  private buildLayers() {
    // 找到根节点
    const rootNodes = [...this.nodes.values()].filter(
      n => !n.parentUuid || !this.nodes.has(n.parentUuid)
    )

    // 层序遍历
    let currentLevel = rootNodes
    let level = 0

    while (currentLevel.length > 0) {
      this.layers.push({ level, nodes: currentLevel })

      const nextLevel: Node[] = []
      for (const node of currentLevel) {
        for (const child of this.nodes.values()) {
          if (child.parentUuid === node.uuid) {
            nextLevel.push(child)
          }
        }
      }
      currentLevel = nextLevel
      level++
    }
  }

  private buildChains(): CallChain[] {
    // 根据 Node 的 call_links 构建边
    for (const node of this.nodes.values()) {
      for (const link of node.callLinks) {
        this.callChains.push({
          chainId: `${link.source}-${link.target}`,
          source: link.source,
          target: link.target,
          linkType: link.linkType,
        })
      }
    }
  }

  private generateEvents(): SimulationEvent[] {
    const events: SimulationEvent[] = []
    let time = 0

    for (const chain of this.callChains) {
      // 节点去重
      if (!events.some(e => e.payload.nodeId === chain.source)) {
        events.push({
          time,
          type: 'node_spawn',
          payload: {
            nodeId: chain.source,
            nodeType: this.getNodeType(chain.source),
            displayName: this.getDisplayName(chain.source),
          },
        })
      }

      if (!events.some(e => e.payload.nodeId === chain.target)) {
        events.push({
          time,
          type: 'node_spawn',
          payload: {
            nodeId: chain.target,
            nodeType: this.getNodeType(chain.target),
            displayName: this.getDisplayName(chain.target),
          },
        })
      }

      // 边
      events.push({
        time,
        type: 'edge_create',
        payload: {
          edgeId: `${chain.source}-${chain.target}`,
          source: chain.source,
          target: chain.target,
          linkType: chain.linkType,
        },
      })

      // 粒子
      events.push({
        time,
        type: 'particle_dispatch',
        payload: {
          particle: {
            id: `p-${time}-${chain.source}-${chain.target}`,
            edgeId: `${chain.source}-${chain.target}`,
            progress: 0,
            type: this.getParticleType(chain.linkType),
            color: this.getParticleColor(chain.linkType),
            size: 4,
            trailLength: 0.15,
          },
        },
      })

      time += 500  // 每 500ms 一个事件
    }

    return events
  }
}
```

### 6.2 位置初始化

```typescript
function initializeNodePosition(
  nodeId: string,
  parentId: string | null,
  nodes: Map<string, PositionedNode>,
): { x: number; y: number } {
  if (!parentId) {
    // 第一个节点放在中心
    return { x: 400, y: 300 }
  }

  const parent = nodes.get(parentId)
  if (!parent) {
    return { x: 400, y: 300 }
  }

  // 根据节点类型决定位置
  if (nodeId === '1') {
    // main_agent 在 parent 右侧
    return { x: parent.x + 150, y: parent.y }
  }
  if (nodeId === '2') {
    // assistant 在 main_agent 右侧
    return { x: parent.x + 150, y: parent.y }
  }
  if (nodeId.startsWith('call_')) {
    // tool 用 findToolSlot
    return findToolSlot(parent, nodes, new Map())
  }

  return { x: parent.x + 100, y: parent.y + 50 }
}
```

---

## 7. 风险评估

| 风险 | 等级 | 描述 | 应对 |
|------|------|------|------|
| Canvas 2D 渲染复杂度高 | 高 | 需要手写大量渲染逻辑 | 参考 agent-flow 实现，复用现有 draw 函数 |
| 布局算法不准确 | 中 | 节点位置计算可能不合理 | 参考 agent-flow 的 findToolSlot 算法 |
| 性能问题 | 中 | 大量节点/边可能影响帧率 | 使用 requestAnimationFrame，限制粒子数量 |
| 与现有 React Flow 代码冲突 | 低 | 需要替换现有实现 | 新建 AgentFlowViewCanvas 组件，逐步迁移 |

---

## 8. 实现计划

### 阶段 1: 基础架构
1. 创建 `src/components/AgentFlowView/simulation/` 目录
2. 实现 `CallGraphBuilder` (TypeScript 版)
3. 实现 `useAgentSimulation` hook
4. 实现基础类型定义

### 阶段 2: Canvas 渲染
1. 创建 `src/components/AgentFlowView/canvas/` 目录
2. 实现背景绘制（六边形网格、Bloom）
3. 实现节点绘制
4. 实现边绘制（含自调用圆弧）
5. 实现粒子绘制

### 阶段 3: 动画系统
1. 实现动画循环
2. 实现节点淡入淡出
3. 实现粒子流动
4. 实现 ControlBar

### 阶段 4: Activity Log
1. 实现右侧日志面板
2. 实现播放联动

### 阶段 5: 集成与优化
1. 替换现有的 React Flow 实现
2. 性能优化
3. Bug 修复
