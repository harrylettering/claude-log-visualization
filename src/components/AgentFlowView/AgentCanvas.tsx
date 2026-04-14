/**
 * Main Canvas component for agent visualization with 3-panel layout.
 * Uses real flow data from parsed JSONL logs.
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { ParsedLogData } from '../../types/log'
import type { FlowNode, NodeType, EdgeSemantics } from '../../types/flow'
import { buildFlowGraph } from '../../utils/flowParser'
import { Terminal, Loader2, Play, Pause, RotateCcw, User, Bot, Cpu } from 'lucide-react'

// ─── Layout Constants ─────────────────────────────────────────────────────────

const LAYOUT = {
  sidebarWidth: '30%',
  timelineHeight: 150,
  toolbarHeight: 48,
}

// ─── Canvas Constants ─────────────────────────────────────────────────────────

const AGENT_DRAW = {
  radiusMain: 32,
  radiusSub: 24,
  glowPadding: 24,
  labelYOffset: 10,
}

const BEAM = {
  curvature: 0.15,
  cp1: 0.33,
  cp2: 0.66,
  segments: 16,
  parentChild: { startW: 4, endW: 2 },
  glowExtra: { startW: 4, endW: 2, alpha: 0.15 },
  idleAlpha: 0.15,
  activeAlpha: 0.5,
  wobble: { amp: 3, freq: 10, timeFreq: 3, trailOffset: 0.15 },
}

const FX = {
  trailSegments: 8,
}

const PARTICLE_DRAW = {
  glowRadius: 25,
  coreHighlightScale: 0.5,
}

// Event-driven playback timing
const TIMING = {
  eventSpacing: 0.3,        // sim seconds between edge events
  particleLifetime: 0.8,    // how long each particle lives
  nodeFadeIn: 0.4,          // how long nodes take to fade in
  pulseDuration: 0.6,       // how long the ripple lingers after a hit
  speed: 1.0,               // playback multiplier
  fitPadding: 48,           // canvas padding around the graph
  // New animation phases (per call sequence)
  calleeAppear: 0.25,        // time for callee to fade in
  callerToCallee: 0.4,      // particle travel from caller to callee
  calleeShow: 0.6,          // floating panel shows content
  calleeToCaller: 0.4,      // particle travel back
  calleeFadeOut: 0.25,        // callee fades out
}

// ─── Colors (Holographic theme) ─────────────────────────────────────────────

const COLORS = {
  void: '#0a0a0c',
  panelBg: 'rgba(15, 15, 20, 0.95)',
  cardBg: '#0f1419',
  textPrimary: '#e8e8e8',
  textDim: '#6b7280',
  holoBase: '#66ccff',
  holoHot: '#ffffff',
  user: '#88ff88',
  assistant: '#66ccff',
  llm: '#cc88ff',
  subagent: '#ffaa44',
  tool: '#ffbb44',
  toolError: '#ff6666',
  thinking: '#66ccff',
  tool_calling: '#ffbb44',
  complete: '#66ffaa',
  idle: '#888899',
  dispatch: '#cc88ff',
  return: '#ff8866',
}

function getNodeColor(type: NodeType): string {
  switch (type) {
    case 'user': return COLORS.user
    case 'assistant': return COLORS.assistant
    case 'llm': return COLORS.llm
    case 'subagent': return COLORS.subagent
    case 'tool-bash': return COLORS.tool
    case 'tool-file': return COLORS.tool
    case 'tool-network': return COLORS.tool
    case 'tool-mcp': return COLORS.tool
    case 'tool-task': return COLORS.subagent
    default: return COLORS.tool
  }
}

// ─── Semantic Edge Colors ──────────────────────────────────────────────────────

const SEMANTIC_COLORS: Record<EdgeSemantics, string> = {
  user_to_agent: '#88ff88',      // 绿色
  agent_to_llm: '#cc88ff',       // 紫色
  llm_to_tool: '#ffbb44',        // 橙色
  tool_to_llm: '#ff8866',        // 橙红
  llm_to_agent: '#cc88ff',       // 紫色
  agent_to_user: '#66ccff',      // 蓝色
  agent_to_subagent: '#ffaa44',  // 橙色
  subagent_to_agent: '#ff8866',  // 橙红
  init: '#66ccff',               // 蓝色
}

function getEdgeColorBySemantics(semantics?: EdgeSemantics): string {
  if (!semantics) return COLORS.holoBase
  return SEMANTIC_COLORS[semantics] || COLORS.holoBase
}

// ─── Bezier Math ───────────────────────────────────────────────────────────

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function computeControlPoints(fromX: number, fromY: number, toX: number, toY: number) {
  const dx = toX - fromX
  const dy = toY - fromY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return null
  const curvature = dist * BEAM.curvature
  const perpX = -dy / dist * curvature
  const perpY = dx / dist * curvature
  return {
    cp1x: fromX + dx * BEAM.cp1 + perpX,
    cp1y: fromY + dy * BEAM.cp1 + perpY,
    cp2x: fromX + dx * BEAM.cp2 + perpX,
    cp2y: fromY + dy * BEAM.cp2 + perpY,
    dist,
    dx,
    dy,
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ActiveNode {
  id: string
  node: FlowNode
  opacity: number
  scale: number
  state: 'spawning' | 'thinking' | 'tool_call' | 'complete' | 'fading' | 'idle'
  spawnTime: number
  completeTime: number
  fadeTime: number
  pulseTime: number       // last time this node was "hit" by an event
  x: number               // center x (graph-space)
  y: number               // center y (graph-space)
}

interface ActiveParticle {
  id: string
  edgeId: string
  birthTime: number
  progress: number        // 0..1, computed each frame from currentTime - birthTime
  type: 'dispatch' | 'return'
  color: string
  size: number
  // For sequence-based animation
  fromNode?: FlowNode    // Source node for this particle
  toNode?: FlowNode      // Target node for this particle
  direction?: 'forward' | 'backward'  // Direction along the edge
}

// Animation phases for call sequence
type AnimationPhase =
  | 'idle'                    // No active call
  | 'callee_appear'          // Callee node fading in
  | 'caller_to_callee'       // Line traveling from caller to callee
  | 'callee_show'            // Callee showing what it did (floating panel)
  | 'callee_to_caller'       // Line traveling back from callee to caller
  | 'callee_fadeout'         // Callee fading out

interface CallSequence {
  id: string
  callerId: string        // The node initiating the call (e.g., main-agent)
  calleeId: string        // The node being called (e.g., tool)
  callerNode: FlowNode     // Reference to caller node
  calleeNode: FlowNode    // Reference to callee node
  phase: AnimationPhase
  phaseStartTime: number  // When current phase started
  phaseDuration: number   // Duration of current phase
  toolName?: string
  isComplete: boolean
}

interface FlowEvent {
  time: number
  edgeIndex: number       // index into graph.edges
  isReturn: boolean       // Whether this is a return edge
}

interface FitTransform {
  scale: number
  offsetX: number
  offsetY: number
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ nodeCount, toolCount }: { nodeCount: number; toolCount: number }) {
  return (
    <div className="flex items-center gap-6 px-4">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-[10px] text-slate-400">
          <span className="font-bold text-white">{nodeCount}</span> nodes
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-amber-400" />
        <span className="text-[10px] text-slate-400">
          <span className="font-bold text-white">{toolCount}</span> tools
        </span>
      </div>
    </div>
  )
}

// ─── Playback Controls ────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.5, 1, 2, 4]

function PlaybackControls({
  isPlaying,
  currentTime,
  maxTime,
  speed,
  onPlay,
  onPause,
  onRestart,
  onSpeedChange,
}: {
  isPlaying: boolean
  currentTime: number
  maxTime: number
  speed: number
  onPlay: () => void
  onPause: () => void
  onRestart: () => void
  onSpeedChange: (speed: number) => void
}) {
  const pct = maxTime > 0 ? (currentTime / maxTime) * 100 : 0

  return (
    <div className="flex items-center gap-3">
      <button onClick={onRestart} className="p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all" title="Restart">
        <RotateCcw className="w-4 h-4" />
      </button>

      <button
        onClick={isPlaying ? onPause : onPlay}
        className="p-2.5 rounded-xl transition-all"
        style={{
          background: isPlaying ? '#f59e0b' : '#00f0ff',
          color: '#000',
          boxShadow: isPlaying ? '0 0 20px #f59e0b60' : '0 0 20px #00f0ff60',
        }}
      >
        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
      </button>

      <div className="w-48 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-150 relative"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #00f0ff, #3b82f6)', boxShadow: '0 0 12px #00f0ff60' }}
        />
      </div>

      <div className="text-[10px] text-slate-500 font-mono">
        {currentTime.toFixed(1)}s / {maxTime.toFixed(1)}s
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-1 ml-2">
        <span className="text-[9px] text-slate-500 uppercase mr-1">Speed</span>
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
              speed === s
                ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Timeline Panel ────────────────────────────────────────────────────────────

function TimelinePanel({ currentTime, maxTime, nodes }: { currentTime: number; maxTime: number; nodes: ActiveNode[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.parentElement?.clientWidth || 800
    const h = 80

    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.fillStyle = COLORS.panelBg
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(0, 0, w, 24)

    const timeScale = Math.min(80, w / (maxTime + 1))
    ctx.fillStyle = COLORS.textDim
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'

    for (let t = 0; t <= maxTime + 1; t++) {
      const x = 40 + t * timeScale
      if (x > w - 20) break
      ctx.fillText(`${t}s`, x, 16)
    }

    const rowHeight = 24
    nodes.forEach((n, i) => {
      if (!n.node.label) return
      const y = 28 + i * rowHeight
      ctx.fillStyle = getNodeColor(n.node.type)
      ctx.font = '8px system-ui'
      ctx.textAlign = 'left'
      ctx.fillText(n.node.label, 4, y + 12)

      if (n.opacity > 0.1) {
        const startX = 40 + n.spawnTime * timeScale
        const endX = 40 + Math.min(n.fadeTime, maxTime) * timeScale
        const width = Math.max(0, endX - startX)

        ctx.fillStyle = n.state === 'tool_call' ? COLORS.tool_calling + '60' :
                        n.state === 'thinking' ? COLORS.thinking + '60' :
                        n.state === 'complete' ? COLORS.complete + '60' :
                        COLORS.idle + '40'
        ctx.fillRect(startX, y + 4, width, 14)
      }
    })

    const playheadX = 40 + currentTime * timeScale
    if (playheadX <= w && playheadX >= 40) {
      ctx.strokeStyle = COLORS.holoBase
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, h)
      ctx.stroke()
    }
  }, [currentTime, maxTime, nodes])

  return (
    <div className="w-full border-t border-slate-800/50 bg-slate-900/50">
      <div className="px-4 py-2 border-b border-slate-800/30 flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Execution Timeline</span>
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 80 }} className="w-full" />
    </div>
  )
}

// ─── Activity Sidebar ─────────────────────────────────────────────────────────

interface LogMessage {
  id: string
  type: 'user' | 'assistant' | 'tool' | 'thinking'
  text: string
  time: number
  nodeLabel?: string
}

function ActivitySidebar({ logs }: { logs: LogMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight
  }, [logs])

  const getIcon = (type: string) => {
    switch (type) {
      case 'user': return <User className="w-3 h-3 text-green-400" />
      case 'assistant': return <Bot className="w-3 h-3 text-cyan-400" />
      case 'tool': return <Terminal className="w-3 h-3 text-amber-400" />
      case 'thinking': return <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
      default: return null
    }
  }

  return (
    <div className="flex flex-col h-full border-l border-slate-800/50 bg-slate-900/30" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">Activity Log</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-slate-500">Live</span>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/20 border border-slate-800/30 animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="mt-0.5">{getIcon(log.type)}</div>
            <div className="flex-1 min-w-0">
              {log.nodeLabel && <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{log.nodeLabel}</div>}
              <div className="text-[10px] font-mono text-slate-300 break-all">{log.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Drawing Functions ─────────────────────────────────────────────────────────

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0, hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + '…'
}

// Draw small icon for tool types
function drawToolTypeIcon(ctx: CanvasRenderingContext2D, type: NodeType, x: number, y: number, color: string) {
  const size = 8
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color + '40'
  ctx.lineWidth = 1.5

  switch (type) {
    case 'tool-bash':
      // Terminal icon: rectangle with prompt symbol
      ctx.beginPath()
      ctx.roundRect(x - size/2, y - size/2, size, size, 2)
      ctx.fill()
      ctx.stroke()
      // > symbol
      ctx.beginPath()
      ctx.moveTo(x - 2, y - 1)
      ctx.lineTo(x + 1, y)
      ctx.lineTo(x - 2, y + 1)
      ctx.stroke()
      break
    case 'tool-file':
      // File icon: rectangle with folded corner
      ctx.beginPath()
      ctx.moveTo(x - size/2, y - size/2)
      ctx.lineTo(x + size/2 - 3, y - size/2)
      ctx.lineTo(x + size/2, y - size/2 + 3)
      ctx.lineTo(x + size/2, y + size/2)
      ctx.lineTo(x - size/2, y + size/2)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      break
    case 'tool-network':
      // Globe icon: circle with lines
      ctx.beginPath()
      ctx.arc(x, y, size/2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - size/2, y)
      ctx.lineTo(x + size/2, y)
      ctx.moveTo(x, y - size/2)
      ctx.lineTo(x, y + size/2)
      ctx.stroke()
      break
    case 'tool-mcp':
      // Plug icon: rectangle with prongs
      ctx.beginPath()
      ctx.roundRect(x - 2, y - size/2, 4, size, 1)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - 3, y - size/2)
      ctx.lineTo(x + 3, y - size/2)
      ctx.moveTo(x - 2, y - size/2 - 2)
      ctx.lineTo(x + 2, y - size/2 - 2)
      ctx.stroke()
      break
    case 'tool-database':
      // Database icon: cylinder
      ctx.beginPath()
      ctx.ellipse(x, y - size/3, size/2, size/4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - size/2, y - size/3)
      ctx.lineTo(x - size/2, y + size/3)
      ctx.ellipse(x, y + size/3, size/2, size/4, 0, 0, Math.PI, true)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x + size/2, y - size/3)
      ctx.lineTo(x + size/2, y + size/3)
      ctx.stroke()
      break
    default:
      // Wrench/generic: simple circle with dot
      ctx.beginPath()
      ctx.arc(x, y, size/2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
  }
  ctx.restore()
}

// ─── Floating Info Panel ─────────────────────────────────────────────────────

interface FloatingPanelInfo {
  sourceId: string
  targetId: string
  toolName?: string
  content?: string
}

function drawFloatingInfoPanel(
  ctx: CanvasRenderingContext2D,
  info: FloatingPanelInfo | null,
  nodesMap: Map<string, ActiveNode>,
) {
  if (!info) return

  const sourceNode = nodesMap.get(info.sourceId)
  const targetNode = nodesMap.get(info.targetId)
  if (!sourceNode || !targetNode) return

  // Calculate position (between the two nodes)
  const panelWidth = 280
  const panelHeight = 120
  const midX = (sourceNode.x + targetNode.x) / 2
  const midY = (sourceNode.y + targetNode.y) / 2

  // Determine which node is the target (tool/subagent being called)
  const isSourceTool = sourceNode.node.type.startsWith('tool-')
  const isTargetTool = targetNode.node.type.startsWith('tool-')
  const toolNode = isTargetTool ? targetNode : (isSourceTool ? sourceNode : null)

  if (!toolNode) return

  // Draw panel background
  const panelX = midX - panelWidth / 2
  const panelY = midY + 60 // Offset below the nodes

  ctx.save()

  // Panel shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 20
  ctx.shadowOffsetY = 5

  // Panel background
  ctx.fillStyle = 'rgba(15, 20, 25, 0.95)'
  ctx.strokeStyle = getNodeColor(toolNode.node.type)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 12)
  ctx.fill()
  ctx.stroke()

  ctx.shadowColor = 'transparent'

  // Panel header
  const headerHeight = 28
  ctx.fillStyle = getNodeColor(toolNode.node.type) + '30'
  ctx.beginPath()
  ctx.roundRect(panelX, panelY, panelWidth, headerHeight, [12, 12, 0, 0])
  ctx.fill()

  // Header text
  ctx.fillStyle = COLORS.textPrimary
  ctx.font = 'bold 11px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(toolNode.node.label || toolNode.node.type, panelX + 12, panelY + headerHeight / 2)

  // Header icon (tool type)
  ctx.fillStyle = getNodeColor(toolNode.node.type)
  ctx.font = '10px system-ui'
  ctx.textAlign = 'right'
  ctx.fillText(toolNode.node.sublabel || '', panelX + panelWidth - 12, panelY + headerHeight / 2)

  // Content area
  const contentY = panelY + headerHeight + 8
  const contentX = panelX + 12
  const contentWidth = panelWidth - 24

  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Tool content (command/path/url)
  if (toolNode.node.content) {
    ctx.fillStyle = '#b4cae0'
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'

    // Truncate long content
    const maxWidth = contentWidth
    let displayText = toolNode.node.content
    if (ctx.measureText(displayText).width > maxWidth) {
      while (ctx.measureText(displayText + '…').width > maxWidth && displayText.length > 0) {
        displayText = displayText.slice(0, -1)
      }
      displayText += '…'
    }
    ctx.fillText(displayText, contentX, contentY)
  }

  // Show action type badge
  const actionText = getActionTypeText(toolNode.node.type, toolNode.node.content)
  if (actionText) {
    ctx.fillStyle = getNodeColor(toolNode.node.type) + '40'
    const badgeWidth = ctx.measureText(actionText).width + 16
    ctx.beginPath()
    ctx.roundRect(panelX + panelWidth - badgeWidth - 8, panelY + panelHeight - 28, badgeWidth, 20, 6)
    ctx.fill()
    ctx.fillStyle = getNodeColor(toolNode.node.type)
    ctx.font = '9px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(actionText, panelX + panelWidth - badgeWidth / 2 - 8, panelY + panelHeight - 18)
  }

  // Bottom label
  ctx.fillStyle = COLORS.textDim
  ctx.font = '9px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(
    toolNode.node.type === 'user' ? 'User Input' :
    toolNode.node.type.startsWith('tool-') ? 'Tool Execution' :
    toolNode.node.type === 'llm' ? 'LLM Processing' :
    'Agent',
    panelX + panelWidth / 2,
    panelY + panelHeight - 10
  )

  ctx.restore()
}

function getActionTypeText(nodeType: string, content?: string): string {
  if (nodeType === 'tool-bash') return 'Terminal'
  if (nodeType === 'tool-file') return content?.includes('Read') ? 'Read' : content?.includes('Write') ? 'Write' : 'File'
  if (nodeType === 'tool-network') return 'Network'
  if (nodeType === 'tool-mcp') return 'MCP'
  if (nodeType === 'tool-database') return 'Database'
  if (nodeType === 'user') return 'Input'
  return ''
}

function drawNode(ctx: CanvasRenderingContext2D, activeNode: ActiveNode, time: number) {
  if (activeNode.opacity < 0.05) return

  const node = activeNode.node
  const isTool = node.type.startsWith('tool-')
  const color = getNodeColor(node.type)

  ctx.save()
  ctx.globalAlpha = activeNode.opacity
  ctx.translate(activeNode.x, activeNode.y)
  ctx.scale(activeNode.scale, activeNode.scale)

  // ── Pulse ring: an expanding outline that fires on each event hit ──────────
  const pulseAge = time - activeNode.pulseTime
  if (pulseAge >= 0 && pulseAge < TIMING.pulseDuration) {
    const pp = pulseAge / TIMING.pulseDuration
    const baseR = isTool ? Math.max(node.width, node.height) * 0.55 : AGENT_DRAW.radiusMain + 4
    const ringR = baseR + pp * 24
    const a = Math.round((1 - pp) * 180)
    ctx.beginPath()
    ctx.arc(0, 0, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = color + a.toString(16).padStart(2, '0')
    ctx.lineWidth = 2
    ctx.stroke()
  }

  if (!isTool) {
    // ── Agent / LLM / User / Subagent: hex emblem ─────────────────────────
    const radius = AGENT_DRAW.radiusMain
    const breatheAmp = pulseAge < TIMING.pulseDuration ? 0.08 : 0.02
    const breatheSpeed = pulseAge < TIMING.pulseDuration ? 2.4 : 0.8
    const breathe = Math.sin(time * breatheSpeed) * breatheAmp
    const glowRadius = radius + AGENT_DRAW.glowPadding + (breathe * radius)
    const glowIntensity = activeNode.state === 'tool_call' || activeNode.state === 'complete' ? '70' : '50'

    const glowGradient = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, glowRadius)
    glowGradient.addColorStop(0, color + glowIntensity)
    glowGradient.addColorStop(0.5, color + '30')
    glowGradient.addColorStop(1, color + '00')
    ctx.beginPath()
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = glowGradient
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = COLORS.cardBg
    ctx.fill()
    ctx.strokeStyle = color + (pulseAge < TIMING.pulseDuration ? 'ff' : '99')
    ctx.lineWidth = pulseAge < TIMING.pulseDuration ? 2 : 1.5
    ctx.stroke()

    // Spinning dashed ring while "active"
    if (pulseAge < TIMING.pulseDuration) {
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -time * 20
      ctx.beginPath()
      ctx.arc(0, 0, radius + 7, 0, Math.PI * 2)
      ctx.strokeStyle = color + '80'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Label under the hex
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(node.label || node.type, 0, radius + 8)

    if (node.sublabel) {
      ctx.fillStyle = COLORS.textDim
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillText(node.sublabel, 0, radius + 22)
    }
  } else {
    // ── Tool card: rounded rectangle with label / sublabel / content ─────
    const w = node.width
    const h = node.height
    const active = activeNode.state === 'tool_call' || activeNode.state === 'complete' || activeNode.state === 'spawning'

    // Strong outer glow for tool cards when active
    if (active) {
      ctx.shadowColor = color
      ctx.shadowBlur = 24
    }
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h / 2, w, h, 10)
    ctx.fillStyle = COLORS.cardBg
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = node.errorCount > 0 ? COLORS.toolError : color + (active ? 'ff' : 'aa')
    ctx.lineWidth = active ? 2.5 : 1.2
    ctx.stroke()

    // Colored accent strip on the left edge
    ctx.beginPath()
    ctx.roundRect(-w / 2, -h / 2, 4, h, [10, 0, 0, 10] as any)
    ctx.fillStyle = color
    ctx.fill()

    // Draw tool type icon (small shape indicator based on tool type)
    const iconX = -w / 2 + 14
    const iconY = -h / 2 + 14
    drawToolTypeIcon(ctx, node.type, iconX, iconY, color)

    // Label (top-left, colored)
    ctx.fillStyle = color
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateToWidth(ctx, node.label, w - 90), -w / 2 + 28, -h / 2 + 8)

    // Sublabel / category (top-right, dim)
    if (node.sublabel) {
      ctx.fillStyle = COLORS.textDim
      ctx.font = '9px system-ui, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(node.sublabel, w / 2 - 10, -h / 2 + 9)
    }

    // Content (bottom, monospace)
    if (node.content) {
      ctx.fillStyle = node.errorCount > 0 ? COLORS.toolError : '#b4cae0'
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText(truncateToWidth(ctx, node.content, w - 24), -w / 2 + 12, h / 2 - 8)
    }
  }

  ctx.restore()
}

function drawTaperedBezier(
  ctx: CanvasRenderingContext2D,
  fromX: number, fromY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  toX: number, toY: number,
  startWidth: number, endWidth: number,
  color: string, alpha: number,
) {
  const steps = BEAM.segments

  ctx.beginPath()

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const halfW = (startWidth + (endWidth - startWidth) * t) / 2

    const x = bezierPoint(t, fromX, cp1x, cp2x, toX)
    const y = bezierPoint(t, fromY, cp1y, cp2y, toY)
    const dt = 0.001
    const t0 = Math.max(0, t - dt)
    const t1 = Math.min(1, t + dt)
    const tx = bezierPoint(t1, fromX, cp1x, cp2x, toX) - bezierPoint(t0, fromX, cp1x, cp2x, toX)
    const ty = bezierPoint(t1, fromY, cp1y, cp2y, toY) - bezierPoint(t0, fromY, cp1y, cp2y, toY)
    const len = Math.sqrt(tx * tx + ty * ty) || 1
    const nx = (-ty / len) * halfW
    const ny = (tx / len) * halfW

    if (i === 0) ctx.moveTo(x + nx, y + ny)
    else ctx.lineTo(x + nx, y + ny)
  }

  for (let i = steps; i >= 0; i--) {
    const t = i / steps
    const halfW = (startWidth + (endWidth - startWidth) * t) / 2

    const x = bezierPoint(t, fromX, cp1x, cp2x, toX)
    const y = bezierPoint(t, fromY, cp1y, cp2y, toY)
    const dt = 0.001
    const t0 = Math.max(0, t - dt)
    const t1 = Math.min(1, t + dt)
    const tx = bezierPoint(t1, fromX, cp1x, cp2x, toX) - bezierPoint(t0, fromX, cp1x, cp2x, toX)
    const ty = bezierPoint(t1, fromY, cp1y, cp2y, toY) - bezierPoint(t0, fromY, cp1y, cp2y, toY)
    const len = Math.sqrt(tx * tx + ty * ty) || 1
    const nx = (-ty / len) * halfW
    const ny = (tx / len) * halfW

    ctx.lineTo(x - nx, y - ny)
  }

  ctx.closePath()
  ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0')
  ctx.fill()
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: ActiveParticle,
  fromX: number, fromY: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  toX: number, toY: number,
  time: number,
) {
  const t = particle.progress
  const dx = toX - fromX
  const dy = toY - fromY
  const dist = Math.sqrt(dx * dx + dy * dy)

  const tangentX = dx / dist
  const tangentY = dy / dist
  const normalX = -tangentY
  const normalY = tangentX

  const phase = (particle.id.charCodeAt(5) || 0) * 0.7
  const wobbleAmt = Math.sin(t * BEAM.wobble.freq + time * BEAM.wobble.timeFreq + phase)
    * BEAM.wobble.amp * Math.sin(t * Math.PI)

  const baseX = bezierPoint(t, fromX, cp1x, cp2x, toX)
  const baseY = bezierPoint(t, fromY, cp1y, cp2y, toY)
  const px = baseX + normalX * wobbleAmt
  const py = baseY + normalY * wobbleAmt

  ctx.save()

  const isReturn = particle.type === 'return'
  for (let i = FX.trailSegments; i >= 0; i--) {
    const offset = (i / FX.trailSegments) * BEAM.wobble.trailOffset
    const tt = isReturn
      ? Math.min(1, t + offset)
      : Math.max(0, t - offset)
    const wob = Math.sin(tt * BEAM.wobble.freq + time * BEAM.wobble.timeFreq + phase)
      * BEAM.wobble.amp * Math.sin(tt * Math.PI)
    const tx = bezierPoint(tt, fromX, cp1x, cp2x, toX) + normalX * wob
    const ty = bezierPoint(tt, fromY, cp1y, cp2y, toY) + normalY * wob
    const alpha = ((FX.trailSegments - i) / FX.trailSegments) * 0.9

    ctx.beginPath()
    ctx.fillStyle = particle.color + Math.round(alpha * 255).toString(16).padStart(2, '0')
    ctx.arc(tx, ty, particle.size * 1.5 * ((FX.trailSegments - i) / FX.trailSegments), 0, Math.PI * 2)
    ctx.fill()
  }

  const glowGradient = ctx.createRadialGradient(px, py, 0, px, py, PARTICLE_DRAW.glowRadius)
  glowGradient.addColorStop(0, particle.color + '99')
  glowGradient.addColorStop(1, particle.color + '00')
  ctx.beginPath()
  ctx.arc(px, py, PARTICLE_DRAW.glowRadius, 0, Math.PI * 2)
  ctx.fillStyle = glowGradient
  ctx.fill()

  ctx.beginPath()
  ctx.arc(px, py, particle.size, 0, Math.PI * 2)
  ctx.fillStyle = particle.color
  ctx.fill()

  ctx.beginPath()
  ctx.arc(px, py, particle.size * PARTICLE_DRAW.coreHighlightScale, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.holoHot + '80'
  ctx.fill()

  ctx.restore()
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  // Slightly lighter background for better visibility
  ctx.fillStyle = '#0f1115'
  ctx.fillRect(0, 0, w, h)

  const gridSize = 40
  for (let x = gridSize; x < w; x += gridSize) {
    for (let y = gridSize; y < h; y += gridSize) {
      const pulse = Math.sin(time * 0.5 + x * 0.01 + y * 0.01) * 0.3 + 0.7
      ctx.beginPath()
      ctx.arc(x, y, 1.2 * pulse, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(100, 200, 255, ${0.2 * pulse})`
      ctx.fill()
    }
  }

  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
}

// ─── Main Component ────────────────────────────────────────────────────────────

interface AgentCanvasProps {
  data?: ParsedLogData | null
}

export function AgentCanvas({ data }: AgentCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Dimensions state
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [zoom, setZoom] = useState(1.5)  // Default zoom set to 1.5x for better visibility
  const [pan, setPan] = useState({ x: 0, y: 0 })  // Pan offset for canvas
  const [nodeCount, setNodeCount] = useState(0)
  const [toolCount, setToolCount] = useState(0)
  const [logs, setLogs] = useState<LogMessage[]>([])
  const [timelineNodes, setTimelineNodes] = useState<ActiveNode[]>([])

  // Animation refs - using refs to avoid closure issues
  const isPlayingRef = useRef(false)
  const animationIdRef = useRef<number>(0)
  const timeRef = useRef(0)
  const lastTimeRef = useRef(0)
  const currentTimeRef = useRef(0)
  const activeNodesRef = useRef<ActiveNode[]>([])
  const activeNodesMapRef = useRef<Map<string, ActiveNode>>(new Map())
  const activeParticlesRef = useRef<ActiveParticle[]>([])
  const particleIdRef = useRef(0)
  const eventsRef = useRef<FlowEvent[]>([])
  const eventIndexRef = useRef(0)
  const logsRef = useRef<LogMessage[]>([])
  const logsIdRef = useRef(0)
  const flowGraphRef = useRef<ReturnType<typeof buildFlowGraph> | null>(null)
  const totalDurationRef = useRef(30)
  const fitTransformRef = useRef<FitTransform>({ scale: 1, offsetX: 0, offsetY: 0 })
  const dimensionsRef = useRef(dimensions)
  const speedRef = useRef(1)
  const zoomRef = useRef(1.5)
  const panRef = useRef({ x: 0, y: 0 })
  const lastUiUpdateRef = useRef(0)
  const lastLogCountRef = useRef(0)
  const frameSkipCounterRef = useRef(0) // Frame skip counter for canvas-only frames
  const activeEdgeInfoRef = useRef<{ sourceId: string; targetId: string; toolName?: string; content?: string; phase: AnimationPhase } | null>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  // Call sequences for new animation
  const callSequencesRef = useRef<CallSequence[]>([])

  // Keep dimensionsRef in sync
  useEffect(() => {
    dimensionsRef.current = dimensions
  }, [dimensions])

  // Keep speedRef in sync
  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  // Keep zoomRef in sync
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Build flow graph from parsed data
  const flowGraph = useMemo(() => {
    if (!data || !data.entries || data.entries.length === 0) return null
    try {
      return buildFlowGraph(data)
    } catch (e) {
      console.error('[AgentCanvas] buildFlowGraph error:', e)
      return null
    }
  }, [data])

  // Build the time-ordered event list (one event per edge).
  // Edges without entryIndex (or with negative) come first (init edges),
  // then by entryIndex ascending. Each event is spaced by TIMING.eventSpacing.
  const events = useMemo<FlowEvent[]>(() => {
    if (!flowGraph) return []
    const indexed = flowGraph.edges.map((edge, i) => ({ edge, i }))
    indexed.sort((a, b) => {
      const ai = a.edge.entryIndex ?? 0
      const bi = b.edge.entryIndex ?? 0
      if (ai !== bi) return ai - bi
      // stable within the same entry: keep outgoing before return
      const ar = a.edge.isReturn ? 1 : 0
      const br = b.edge.isReturn ? 1 : 0
      if (ar !== br) return ar - br
      return a.i - b.i
    })
    return indexed.map(({ i }, k) => ({
      time: k * TIMING.eventSpacing,
      edgeIndex: i,
      isReturn: indexed[k].edge.isReturn,
    }))
  }, [flowGraph])

  const totalDuration = useMemo(() => {
    if (events.length === 0) return 10
    // Count call sequences (dispatch edges with tool calls)
    const callSequenceCount = events.filter(e => !e.isReturn && flowGraph?.edges[e.edgeIndex]?.toolName).length
    // Each call sequence takes: calleeAppear + callerToCallee + calleeShow + calleeToCaller + calleeFadeout
    const sequenceDuration = TIMING.calleeAppear + TIMING.callerToCallee + TIMING.calleeShow + TIMING.calleeToCaller + TIMING.calleeFadeOut
    // Plus init edge events (simple particle animations)
    const initEdgeCount = events.filter(e => !e.isReturn && !flowGraph?.edges[e.edgeIndex]?.toolName).length
    const initDuration = initEdgeCount * TIMING.particleLifetime
    // Total = call sequences * sequence duration + init duration + buffer
    return callSequenceCount * sequenceDuration + initDuration + 5
  }, [events, flowGraph])

  // Keep refs in sync with memoized values
  useEffect(() => {
    flowGraphRef.current = flowGraph
    totalDurationRef.current = totalDuration
    eventsRef.current = events
  }, [flowGraph, totalDuration, events])

  // Compute a fit-to-screen transform that maps the (graph-space) bounding box
  // from flowParser into the current canvas dimensions.
  const fitTransform = useMemo<FitTransform>(() => {
    if (!flowGraph || dimensions.width === 0 || dimensions.height === 0) {
      return { scale: 1, offsetX: 0, offsetY: 0 }
    }
    const pad = TIMING.fitPadding
    const availW = Math.max(10, dimensions.width - pad * 2)
    const availH = Math.max(10, dimensions.height - pad * 2)
    const baseScale = Math.min(availW / flowGraph.canvasWidth, availH / flowGraph.canvasHeight, 1.25)
    const scale = baseScale * zoom
    const offsetX = (dimensions.width - flowGraph.canvasWidth * scale) / 2 + pan.x
    const offsetY = (dimensions.height - flowGraph.canvasHeight * scale) / 2 + pan.y
    return { scale, offsetX, offsetY }
  }, [flowGraph, dimensions, zoom, pan])

  useEffect(() => {
    fitTransformRef.current = fitTransform
  }, [fitTransform])

  // Build active-node list using the positions computed by flowParser.
  // Each node's spawn/complete time is derived from the events that touch it,
  // so it fades in only when it's actually involved in the playback.
  const buildActiveNodes = useCallback((
    graph: NonNullable<typeof flowGraph>,
    evs: FlowEvent[],
  ): ActiveNode[] => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return []

    // Seed first-touch / last-touch times from the events list.
    const firstByNode = new Map<string, number>()
    const lastByNode = new Map<string, number>()
    for (const ev of evs) {
      const edge = graph.edges[ev.edgeIndex]
      if (!edge) continue
      for (const id of [edge.sourceId, edge.targetId]) {
        const prevFirst = firstByNode.get(id)
        if (prevFirst === undefined || ev.time < prevFirst) firstByNode.set(id, ev.time)
        const prevLast = lastByNode.get(id)
        if (prevLast === undefined || ev.time > prevLast) lastByNode.set(id, ev.time)
      }
    }

    const totalDur = totalDurationRef.current
    return graph.nodes.map<ActiveNode>(node => {
      // flowParser positions are top-left of the bounding box; convert to center.
      const cx = node.x + node.width / 2
      const cy = node.y + node.height / 2
      const first = firstByNode.get(node.id) ?? 0
      const last = lastByNode.get(node.id) ?? totalDur
      return {
        id: node.id,
        node,
        opacity: 0,
        scale: 0.55,
        state: 'spawning',
        spawnTime: Math.max(0, first - 0.15),
        completeTime: last,
        fadeTime: totalDur + 10, // never fade out
        pulseTime: -999,
        x: cx,
        y: cy,
      }
    })
  }, [])

  // Setup resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) })
        }
      }
    })
    observer.observe(container)

    // Mouse wheel zoom handler
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      setZoom(z => Math.min(3, Math.max(0.2, z + delta)))
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    // Mouse drag pan handlers
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click only
        isDraggingRef.current = true
        dragStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y }
        container.style.cursor = 'grabbing'
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        panRef.current = {
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y,
        }
        setPan({ ...panRef.current })
      }
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        container.style.cursor = 'grab'
      }
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseup', handleMouseUp)
    container.addEventListener('mouseleave', handleMouseUp)
    container.style.cursor = 'grab'

    return () => {
      observer.disconnect()
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseup', handleMouseUp)
      container.removeEventListener('mouseleave', handleMouseUp)
    }
  }, [])

  // Initialize active nodes whenever the flow graph or events list changes.
  useEffect(() => {
    if (flowGraph && events.length > 0) {
      const builtNodes = buildActiveNodes(flowGraph, events)
      activeNodesRef.current = builtNodes
      const map = new Map<string, ActiveNode>()
      for (const n of builtNodes) map.set(n.id, n)
      activeNodesMapRef.current = map
      setTimelineNodes(builtNodes)

      // Particles are spawned by the event playhead — start empty.
      activeParticlesRef.current = []
      particleIdRef.current = 0
      eventIndexRef.current = 0
      logsRef.current = []
      logsIdRef.current = 0
      currentTimeRef.current = 0
      timeRef.current = 0
      lastTimeRef.current = 0
      isPlayingRef.current = true
      setIsPlaying(true)
    }
  }, [flowGraph, events, buildActiveNodes])

  // Animation loop - separate from React rendering
  const animateRef = useRef<(timestamp: number) => void>(() => {})

  animateRef.current = (timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    let deltaTime = (timestamp - lastTimeRef.current) / 1000
    lastTimeRef.current = timestamp
    deltaTime = Math.min(deltaTime, 0.1)

    timeRef.current += deltaTime

    const graph = flowGraphRef.current
    const evs = eventsRef.current
    const nodesMap = activeNodesMapRef.current
    const activeNodes = activeNodesRef.current

    if (isPlayingRef.current && graph) {
      currentTimeRef.current += deltaTime * speedRef.current
      const t = currentTimeRef.current

      if (t >= totalDurationRef.current) {
        currentTimeRef.current = totalDurationRef.current
        isPlayingRef.current = false
        setIsPlaying(false)
      }

      // ── Fire events whose time has arrived ────────────────────────────
      // For dispatch edges (caller → callee), start a new call sequence
      // For return edges (callee → caller), complete the current sequence
      while (eventIndexRef.current < evs.length && evs[eventIndexRef.current].time <= t) {
        const ev = evs[eventIndexRef.current]
        const edge = graph.edges[ev.edgeIndex]
        eventIndexRef.current++
        if (!edge) continue

        const src = nodesMap.get(edge.sourceId)
        const tgt = nodesMap.get(edge.targetId)

        if (!ev.isReturn) {
          // Dispatch edge - start a new call sequence
          const seq: CallSequence = {
            id: `seq-${callSequencesRef.current.length}`,
            callerId: edge.sourceId,
            calleeId: edge.targetId,
            callerNode: src?.node!,
            calleeNode: tgt?.node!,
            phase: 'callee_appear',
            phaseStartTime: t,
            phaseDuration: TIMING.calleeAppear,
            toolName: edge.toolName,
            isComplete: false,
          }
          callSequencesRef.current.push(seq)

          // Log entry for dispatch
          if (src && tgt) {
            const logText = edge.toolName
              ? `${src.node.label} → ${tgt.node.label}  ·  ${edge.toolName}`
              : `${src.node.label} → ${tgt.node.label}`
            logsRef.current.push({
              id: `log-${logsIdRef.current++}`,
              type: 'tool',
              text: logText,
              time: t,
              nodeLabel: src.node.label,
            })
            if (logsRef.current.length > 80) logsRef.current.shift()
          }
        } else {
          // Return edge - the call sequence completes when return arrives
          // Find the matching call sequence by finding the most recent incomplete one
          // with the same callee (the tool)
          const matchingSeq = [...callSequencesRef.current].reverse().find(
            s => !s.isComplete && s.calleeId === edge.sourceId
          )
          if (matchingSeq) {
            // Advance to return phase
            matchingSeq.phase = 'callee_to_caller'
            matchingSeq.phaseStartTime = t
            matchingSeq.phaseDuration = TIMING.calleeToCaller
          }

          // Log entry for return
          if (src && tgt) {
            const logText = `← ${src.node.label}${edge.isError ? ' (error)' : ''}`
            logsRef.current.push({
              id: `log-${logsIdRef.current++}`,
              type: 'tool',
              text: logText,
              time: t,
              nodeLabel: src.node.label,
            })
            if (logsRef.current.length > 80) logsRef.current.shift()
          }
        }
      }

      // ── Update call sequences - advance phases ────────────────────────
      for (const seq of callSequencesRef.current) {
        if (seq.isComplete) continue

        const elapsed = t - seq.phaseStartTime

        if (elapsed >= seq.phaseDuration) {
          // Advance to next phase
          switch (seq.phase) {
            case 'callee_appear':
              seq.phase = 'caller_to_callee'
              seq.phaseStartTime = t
              seq.phaseDuration = TIMING.callerToCallee
              // Spawn particle going from caller to callee
              const callerNodeForDispatch = nodesMap.get(seq.callerId)
              const calleeNodeForDispatch = nodesMap.get(seq.calleeId)
              if (callerNodeForDispatch && calleeNodeForDispatch) {
                activeParticlesRef.current.push({
                  id: `p${particleIdRef.current++}`,
                  edgeId: `${seq.id}-dispatch`,
                  birthTime: t,
                  progress: 0,
                  type: 'dispatch',
                  color: seq.callerNode?.type === 'tool-bash' ? COLORS.tool :
                         seq.callerNode?.type === 'tool-mcp' ? COLORS.tool :
                         seq.callerNode?.type === 'subagent' ? COLORS.subagent : COLORS.dispatch,
                  size: 5,
                  fromNode: callerNodeForDispatch.node,
                  toNode: calleeNodeForDispatch.node,
                  direction: 'forward',
                })
              }
              break
            case 'caller_to_callee':
              seq.phase = 'callee_show'
              seq.phaseStartTime = t
              seq.phaseDuration = TIMING.calleeShow
              break
            case 'callee_show':
              seq.phase = 'callee_to_caller'
              seq.phaseStartTime = t
              seq.phaseDuration = TIMING.calleeToCaller
              // Spawn particle going from callee back to caller
              const callerNodeForReturn = nodesMap.get(seq.callerId)
              const calleeNodeForReturn = nodesMap.get(seq.calleeId)
              if (callerNodeForReturn && calleeNodeForReturn) {
                activeParticlesRef.current.push({
                  id: `p${particleIdRef.current++}`,
                  edgeId: `${seq.id}-return`,
                  birthTime: t,
                  progress: 0,
                  type: 'return',
                  color: COLORS.return,
                  size: 5,
                  fromNode: calleeNodeForReturn.node,
                  toNode: callerNodeForReturn.node,
                  direction: 'backward',
                })
              }
              break
            case 'callee_to_caller':
              seq.phase = 'callee_fadeout'
              seq.phaseStartTime = t
              seq.phaseDuration = TIMING.calleeFadeOut
              break
            case 'callee_fadeout':
              seq.isComplete = true
              break
          }
        }
      }

      // ── Update node opacity / scale / state based on sequences ─────────
      // Find active sequence (the most recent incomplete one)
      const activeSeq = [...callSequencesRef.current].reverse().find(s => !s.isComplete)

      // Update active edge info for floating panel
      if (activeSeq) {
        if (activeSeq.phase === 'callee_show' || activeSeq.phase === 'callee_to_caller') {
          activeEdgeInfoRef.current = {
            sourceId: activeSeq.callerId,
            targetId: activeSeq.calleeId,
            toolName: activeSeq.toolName,
            phase: activeSeq.phase,
          }
        } else {
          activeEdgeInfoRef.current = null
        }
      } else {
        activeEdgeInfoRef.current = null
      }

      for (const n of activeNodes) {
        if (t < n.spawnTime) {
          n.opacity = 0
          n.scale = 0.55
          n.state = 'spawning'
          continue
        }

        // Check if this node is involved in the active sequence
        const isMainAgent = n.node.id === 'main-agent'
        const isInActiveSeq = activeSeq && (activeSeq.callerId === n.node.id || activeSeq.calleeId === n.node.id)
        const isCallee = activeSeq && activeSeq.calleeId === n.node.id

        let opacity = 0.4
        let scale = 0.65
        let state: ActiveNode['state'] = 'idle'

        if (isInActiveSeq && activeSeq) {
          const seqElapsed = t - activeSeq.phaseStartTime
          const seqProgress = Math.min(1, seqElapsed / activeSeq.phaseDuration)

          switch (activeSeq.phase) {
            case 'callee_appear':
              if (isCallee) {
                // Callee fades in with spring effect
                opacity = seqProgress * 1.0
                scale = 0.55 + seqProgress * 0.5
                state = 'spawning'
              } else if (isMainAgent) {
                opacity = 0.6
                scale = 0.75
                state = 'thinking'
              }
              break
            case 'caller_to_callee':
              if (isCallee) {
                // Callee fully visible with bright glow
                opacity = 1.0
                scale = 1.05
                state = 'tool_call'
              } else if (isMainAgent) {
                opacity = 0.8
                scale = 0.9
                state = 'tool_call'
              }
              break
            case 'callee_show':
              if (isCallee) {
                // Callee showing what it did - maximum visibility
                opacity = 1.0
                scale = 1.0
                state = 'complete'
              } else if (isMainAgent) {
                opacity = 0.6
                scale = 0.8
                state = 'thinking'
              }
              break
            case 'callee_to_caller':
              if (isCallee) {
                // Callee fading out but still visible
                opacity = 1.0 - seqProgress * 0.9
                scale = 1.0 - seqProgress * 0.4
                state = 'fading'
              } else if (isMainAgent) {
                opacity = 0.7 + seqProgress * 0.2
                scale = 0.8 + seqProgress * 0.1
                state = 'tool_call'
              }
              break
            case 'callee_fadeout':
              if (isCallee) {
                // Callee fading out completely
                opacity = Math.max(0, 0.85 - seqProgress * 0.85)
                scale = Math.max(0.55, 0.95 - seqProgress * 0.4)
                state = 'fading'
              } else if (isMainAgent) {
                opacity = 0.55
                scale = 0.7
                state = 'idle'
              }
              break
          }
        } else if (isMainAgent) {
          // Main agent always more visible
          const fi = Math.min(0.5, (t - n.spawnTime) / TIMING.nodeFadeIn * 0.5)
          opacity = 0.45 + fi
          scale = 0.7 + fi * 0.1
          state = 'idle'
        }

        n.opacity = opacity
        n.scale = scale
        n.state = state

        if (isInActiveSeq && !isCallee) {
          n.pulseTime = t
        } else if (isCallee && activeSeq?.phase === 'caller_to_callee') {
          n.pulseTime = t
        }
      }

      // ── Update particles and prune dead ones ───────────────────────────
      const alive: ActiveParticle[] = []
      for (const p of activeParticlesRef.current) {
        const prog = (t - p.birthTime) / TIMING.particleLifetime
        if (prog >= 1) continue
        p.progress = Math.max(0, prog)
        alive.push(p)
      }
      activeParticlesRef.current = alive

      // ── Throttled React state updates (~5 fps) ────────────────────────
      const now = performance.now()
      if (now - lastUiUpdateRef.current > 200) {
        lastUiUpdateRef.current = now
        setCurrentTime(currentTimeRef.current)
        setNodeCount(activeNodes.filter(n => n.opacity > 0.1).length)
        setToolCount(activeNodes.filter(n => n.node.type.startsWith('tool-') && n.opacity > 0.1).length)
        if (logsRef.current.length !== lastLogCountRef.current) {
          lastLogCountRef.current = logsRef.current.length
          setLogs([...logsRef.current])
        }
        setTimelineNodes(activeNodes.map(n => ({ ...n })))
      }
    }

    // ── Draw every frame ──────────────────────────────────────────────────
    frameSkipCounterRef.current++
    const shouldDraw = isPlayingRef.current || frameSkipCounterRef.current % 3 === 0

    if (shouldDraw) {
      const canvas = canvasRef.current
      if (canvas && graph) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = dimensionsRef.current.width
          const h = dimensionsRef.current.height
          const dpr = window.devicePixelRatio || 1

          if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr
            canvas.height = h * dpr
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.scale(dpr, dpr)
          }

          drawBackground(ctx, w, h, timeRef.current)

          // Fit transform: map graph-space → screen-space so the whole 4-column
          // layout is centered in the canvas.
          const fit = fitTransformRef.current
          ctx.save()
          ctx.translate(fit.offsetX, fit.offsetY)
          ctx.scale(fit.scale, fit.scale)

          // ── Edges ───────────────────────────────────────────────────────
          // Determine active edges based on call sequences
          const activeSeq = [...callSequencesRef.current].reverse().find(s => !s.isComplete)
          const callerToCalleeActive = activeSeq && (activeSeq.phase === 'caller_to_callee' || activeSeq.phase === 'callee_show')
          const calleeToCallerActive = activeSeq && activeSeq.phase === 'callee_to_caller'

          for (const edge of graph.edges) {
            const fromNode = nodesMap.get(edge.sourceId)
            const toNode = nodesMap.get(edge.targetId)
            if (!fromNode || !toNode) continue
            if (fromNode.opacity < 0.05 && toNode.opacity < 0.05) continue

            const cp = computeControlPoints(fromNode.x, fromNode.y, toNode.x, toNode.y)
            if (!cp) continue

            // Check if this edge is part of the active sequence
            let isActive = false
            if (activeSeq) {
              const isCallerToCallee = edge.sourceId === activeSeq.callerId && edge.targetId === activeSeq.calleeId
              const isCalleeToCaller = edge.sourceId === activeSeq.calleeId && edge.targetId === activeSeq.callerId
              isActive = Boolean((isCallerToCallee && callerToCalleeActive) || (isCalleeToCaller && calleeToCallerActive))
            }

            // Use semantic color if available, otherwise fall back to error or default
            const edgeColor = edge.isError
              ? COLORS.toolError
              : isActive
                ? getEdgeColorBySemantics(edge.semantics)
                : COLORS.holoBase + '40' // Dim non-active edges
            const baseAlpha = isActive ? BEAM.activeAlpha : BEAM.idleAlpha

            drawTaperedBezier(
              ctx,
              fromNode.x, fromNode.y,
              cp.cp1x, cp.cp1y,
              cp.cp2x, cp.cp2y,
              toNode.x, toNode.y,
              BEAM.parentChild.startW, BEAM.parentChild.endW,
              edgeColor, baseAlpha,
            )

            if (isActive) {
              drawTaperedBezier(
                ctx,
                fromNode.x, fromNode.y,
                cp.cp1x, cp.cp1y,
                cp.cp2x, cp.cp2y,
                toNode.x, toNode.y,
                BEAM.glowExtra.startW * 2, BEAM.glowExtra.endW * 2,
                edgeColor, BEAM.glowExtra.alpha * 2,
              )
            }
          }

          // ── Particles ──────────────────────────────────────────────────
          for (const particle of activeParticlesRef.current) {
            // Use stored fromNode/toNode if available (sequence-based animation)
            let fromNode = particle.fromNode ? nodesMap.get(particle.fromNode.id) : null
            let toNode = particle.toNode ? nodesMap.get(particle.toNode.id) : null

            // Fallback: locate edge by id for particles without stored nodes
            if (!fromNode || !toNode) {
              const edge = graph.edges.find(e => e.id === particle.edgeId)
              if (edge) {
                fromNode = nodesMap.get(edge.sourceId)
                toNode = nodesMap.get(edge.targetId)
              }
            }

            if (!fromNode || !toNode) continue
            const cp = computeControlPoints(fromNode.x, fromNode.y, toNode.x, toNode.y)
            if (!cp) continue

            drawParticle(
              ctx, particle,
              fromNode.x, fromNode.y,
              cp.cp1x, cp.cp1y,
              cp.cp2x, cp.cp2y,
              toNode.x, toNode.y,
              timeRef.current,
            )
          }

          // ── Nodes ──────────────────────────────────────────────────────
          for (const activeNode of activeNodes) {
            drawNode(ctx, activeNode, timeRef.current)
          }

          // ── Floating Info Panel ────────────────────────────────────────
          drawFloatingInfoPanel(ctx, activeEdgeInfoRef.current, nodesMap)

          ctx.restore()
        }
      }
    }

    animationIdRef.current = requestAnimationFrame(animateRef.current)
  }

  // Start animation loop
  useEffect(() => {
    animationIdRef.current = requestAnimationFrame(animateRef.current)
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    }
  }, [])

  // Handle play/pause
  const handlePlay = useCallback(() => {
    isPlayingRef.current = true
    setIsPlaying(true)
  }, [])

  const handlePause = useCallback(() => {
    isPlayingRef.current = false
    setIsPlaying(false)
  }, [])

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed)
  }, [])

  const handleRestart = useCallback(() => {
    currentTimeRef.current = 0
    timeRef.current = 0
    lastTimeRef.current = 0
    eventIndexRef.current = 0
    logsRef.current = []
    logsIdRef.current = 0
    setLogs([])
    setCurrentTime(0)
    setNodeCount(0)
    setToolCount(0)

    if (flowGraphRef.current && eventsRef.current.length > 0) {
      const builtNodes = buildActiveNodes(flowGraphRef.current, eventsRef.current)
      activeNodesRef.current = builtNodes
      const map = new Map<string, ActiveNode>()
      for (const n of builtNodes) map.set(n.id, n)
      activeNodesMapRef.current = map
      setTimelineNodes(builtNodes)
      activeParticlesRef.current = []
      particleIdRef.current = 0
    }

    isPlayingRef.current = true
    setIsPlaying(true)
  }, [buildActiveNodes])

  // Early return if no data
  if (!data || !flowGraph) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ background: '#0a0a0c' }}>
        <Cpu className="w-16 h-16 text-slate-700 mb-4" />
        <p className="text-slate-500 text-lg font-bold">No log data available</p>
        <p className="text-slate-600 text-sm mt-2">Select a session to view the agent flow</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ background: '#0a0a0c', height: '100%' }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-6 px-4 border-b border-slate-800/50 flex-shrink-0"
        style={{ height: LAYOUT.toolbarHeight, background: 'rgba(10, 10, 15, 0.95)', backdropFilter: 'blur(12px)' }}
      >
        <PlaybackControls
          isPlaying={isPlaying}
          currentTime={currentTime}
          maxTime={totalDuration}
          speed={speed}
          onPlay={handlePlay}
          onPause={handlePause}
          onRestart={handleRestart}
          onSpeedChange={handleSpeedChange}
        />
        <StatsBar nodeCount={nodeCount} toolCount={toolCount} />
        <div className="ml-auto flex items-center gap-2">
          {/* Zoom indicator */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/30">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mr-1">Zoom</span>
            <span className="text-[10px] text-cyan-400 font-bold">{(zoom * 100).toFixed(0)}%</span>
          </div>
          {/* Reset zoom/pan button */}
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 }; }}
            className="px-2 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:text-white hover:border-slate-600 transition-all text-[10px] font-bold"
            title="Reset zoom and pan"
          >
            Reset
          </button>
          {/* Pan hint */}
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/30">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mr-1">Drag</span>
            <span className="text-[10px] text-slate-400 font-bold">to pan</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Center canvas */}
        <div className="flex-1 relative" style={{ minHeight: 0, height: '100%' }}>
          <div ref={containerRef} className="relative w-full h-full overflow-hidden">
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} className="w-full h-full" />
          </div>

          {/* Legend */}
          <div
            className="absolute bottom-4 left-4 z-30 p-3 rounded-xl border border-slate-800/50"
            style={{ background: 'rgba(10, 10, 15, 0.9)', backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center gap-4">
              {[
                { color: COLORS.user, label: 'User' },
                { color: COLORS.assistant, label: 'Agent' },
                { color: COLORS.llm, label: 'LLM' },
                { color: COLORS.tool, label: 'Tool' },
                { color: COLORS.subagent, label: 'SubAgent' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}60` }} />
                  <span className="text-[9px] text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="relative flex-shrink-0" style={{ width: LAYOUT.sidebarWidth }}>
          <ActivitySidebar logs={logs} />
        </div>
      </div>

      {/* Bottom timeline */}
      <div style={{ height: LAYOUT.timelineHeight }}>
        <TimelinePanel currentTime={currentTime} maxTime={totalDuration} nodes={timelineNodes} />
      </div>
    </div>
  )
}