// Agent Flow Dashboard 类型定义

// ─── 噪音过滤后的核心事件类型 ────────────────────────────────────────────────────

export type CoreEventType =
  | 'user_message'      // 触发 Orchestrator
  | 'agent_thinking_start'  // Orchestrator 进入加载态
  | 'step_start'        // 步骤开始
  | 'tool_call'         // 派生子节点
  | 'tool_result'       // 子节点完成
  | 'error'             // 错误状态
  | 'agent_message_complete' // 闭环回归

export interface SanitizedEvent {
  id: string
  type: CoreEventType
  timestamp: number
  parentId: string | null  // 父节点ID，构建树状结构
  nodeId: string           // 对应的节点ID
  toolName?: string        // 工具名称 (Bash, Read, etc.)
  toolInput?: string       // 工具输入
  toolOutput?: string      // 工具输出
  isError?: boolean
  thinking?: string         // 思考内容
  tokenCount?: number       // Token 消耗
  children?: string[]       // 子节点IDs
}

// ─── React Flow 节点数据 ─────────────────────────────────────────────────────────

export type AgentNodeType = 'orchestrator' | 'tool' | 'user' | 'subagent' | 'thinking'

export type NodeStatus = 'idle' | 'thinking' | 'running' | 'success' | 'error' | 'exiting'

export interface AgentNodeData {
  label: string
  sublabel?: string
  nodeType: AgentNodeType
  status: NodeStatus
  toolName?: string
  toolInput?: string
  toolOutput?: string
  tokenCount?: number
  progress?: number  // 0-100 for progress bars
  error?: string
}

// 简化的节点类型
export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: AgentNodeData
}

// ─── React Flow 边数据 ─────────────────────────────────────────────────────────

export interface AgentEdgeData {
  toolName?: string
  isActive: boolean
  particleProgress: number  // 0-1 粒子位置
  direction: 'forward' | 'backward'
}

// 简化的边类型
export interface FlowEdge {
  id: string
  source: string
  target: string
  type?: string
  animated?: boolean
  data?: AgentEdgeData
}

// ─── 播放状态 ─────────────────────────────────────────────────────────────────

export interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  speed: number
  duration: number
  playheadPosition: number  // 0-100 百分比
}

// ─── 时间轴事件 (Gantt) ────────────────────────────────────────────────────────

export interface GanttEvent {
  id: string
  nodeId: string
  label: string
  startTime: number
  endTime: number
  status: NodeStatus
}

// ─── 日志条目 (侧边栏) ─────────────────────────────────────────────────────────

export interface LogEntry {
  id: string
  timestamp: number
  type: 'user' | 'tool_call' | 'tool_result' | 'thinking' | 'error'
  message: string
  details?: string
}
