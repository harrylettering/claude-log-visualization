import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import type { FlowGraph, FlowNode } from '../types/flow'

// ─── Visual Config ─────────────────────────────────────────────────────────────

interface NodeVis {
  color: string
  bg: string
  border: string
  glow: string
}

const VIS: Record<string, NodeVis> = {
  user:           { color: '#60a5fa', bg: '#071324', border: '#1d4ed8', glow: '#3b82f680' },
  assistant:      { color: '#00f0ff', bg: '#021520', border: '#0891b2', glow: '#00f0ff60' },
  llm:            { color: '#38bdf8', bg: '#071922', border: '#0891b2', glow: '#38bdf860' },
  subagent:       { color: '#818cf8', bg: '#0e0e27', border: '#4338ca', glow: '#818cf860' },
  'tool-bash':    { color: '#4ade80', bg: '#021a0e', border: '#16a34a', glow: '#4ade8060' },
  'tool-file':    { color: '#fbbf24', bg: '#150e02', border: '#b45309', glow: '#fbbf2460' },
  'tool-network': { color: '#22d3ee', bg: '#031926', border: '#0891b2', glow: '#22d3ee60' },
  'tool-mcp':     { color: '#f472b6', bg: '#200a1a', border: '#be185d', glow: '#f472b660' },
  'tool-task':    { color: '#fb923c', bg: '#160800', border: '#c2410c', glow: '#fb923c60' },
  'tool-database':{ color: '#a78bfa', bg: '#100826', border: '#6d28d9', glow: '#a78bfa60' },
  'tool-generic':{ color: '#94a3b8', bg: '#0a0f1c', border: '#334155', glow: '#94a3b860' },
}

const HEX_R: Record<string, number> = {
  user: 26, assistant: 38, llm: 29, subagent: 34,
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

// ─── Animated SVG Dot Grid Background ─────────────────────────────────────────

function DotGrid({ width, height }: { width: number; height: number }) {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.6 }}
    >
      <defs>
        <pattern id="dotGrid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.5" fill="#1e4a6e">
            <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
        </pattern>
        <filter id="dotGlow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={width} height={height} fill="url(#dotGrid)" />
    </svg>
  )
}

// ─── SVG Hexagon with Native Animations ──────────────────────────────────────

function HexSvg({
  R, color, bg, active = false,
}: { R: number; color: string; bg: string; active?: boolean }) {
  const PAD = 11
  const W = R * Math.sqrt(3) + PAD * 2
  const H = R * 2 + PAD * 2
  const cx = W / 2, cy = H / 2

  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`
  }).join(' ')

  const gid = `hg-${color.replace('#', '')}-${R}-${active}`

  return (
    <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <filter id={gid} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation={active ? 8 : 4} result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`hexGrad-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={bg} stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Outer glow */}
      <polygon
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={active ? 5 : 3}
        opacity={active ? 0.6 : 0.25}
        filter={`url(#${gid})`}
      />

      {/* Rotating border ring - using SVG animateTransform */}
      {active && (
        <polygon
          points={pts}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeDasharray="8 4"
          opacity={0.8}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${cx} ${cy}`}
            to={`360 ${cx} ${cy}`}
            dur="3s"
            repeatCount="indefinite"
          />
        </polygon>
      )}

      {/* Filled hex */}
      <polygon
        points={pts}
        fill={`url(#hexGrad-${gid})`}
        stroke={color}
        strokeWidth={active ? 2.5 : 1.5}
      />
    </svg>
  )
}

// ─── Thinking Ring - Using SVG Native Animations ───────────────────────────────

function ThinkingRing({ color, r }: { color: string; r: number }) {
  const cx = r * 1.6
  const cy = r * 1.6

  return (
    <svg
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: r * 3.2,
        height: r * 3.2,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {/* Outer spinning ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r + 14}
        stroke={color}
        strokeWidth="2"
        strokeDasharray="6 6"
        fill="none"
        opacity={0.9}
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`0 ${cx} ${cy}`}
          to={`360 ${cx} ${cy}`}
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Inner counter-rotating ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r + 22}
        stroke={color}
        strokeWidth="1"
        strokeDasharray="3 9"
        fill="none"
        opacity={0.5}
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from={`360 ${cx} ${cy}`}
          to={`0 ${cx} ${cy}`}
          dur="4s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Pulsing glow */}
      <circle
        cx={cx}
        cy={cy}
        r={r + 30}
        stroke={color}
        strokeWidth="0.5"
        fill="none"
        opacity={0.3}
      >
        <animate
          attributeName="r"
          values={`${r + 25};${r + 35};${r + 25}`}
          dur="2s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.2;0.5;0.2"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  )
}

// ─── Root Node (Orchestrator) ────────────────────────────────────────────────

function OrchestratorHex({
  node,
  isActive,
  isSelected,
  onSelect,
  tokenCount,
}: {
  node: FlowNode
  isActive: boolean
  isSelected: boolean
  onSelect: (id: string) => void
  tokenCount: number
}) {
  const v = VIS['assistant']
  const R = 42
  const [pulse, setPulse] = useState(1)
  const pulseRef = useRef<number>(0)

  // More visible pulse animation (1.0 to 1.08 scale)
  useEffect(() => {
    let frame: number
    let lastTime = performance.now()
    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000
      lastTime = currentTime
      pulseRef.current += delta * 1.5 // Speed of pulse
      const newPulse = 1 + Math.sin(pulseRef.current) * 0.06 // More visible: ±6%
      setPulse(newPulse)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className="absolute cursor-pointer select-none"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: `scale(${pulse})`,
        transformOrigin: 'center center',
        transition: 'transform 0.05s linear',
      }}
      onClick={e => { e.stopPropagation(); onSelect(node.id) }}
    >
      {/* Glow background */}
      <div
        className="absolute inset-0 rounded-3xl"
        style={{
          background: `radial-gradient(circle, ${v.glow}40 0%, transparent 70%)`,
          filter: 'blur(20px)',
        }}
      />

      {/* Cost badge */}
      {(node.cost ?? 0) > 0.00001 && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
          <span
            className="px-3 py-1 rounded-full text-[10px] font-black border backdrop-blur-sm"
            style={{
              background: `${v.bg}ee`,
              borderColor: v.color,
              color: v.color,
              boxShadow: `0 0 20px ${v.glow}`,
            }}
          >
            ${(node.cost ?? 0).toFixed(3)}
          </span>
        </div>
      )}

      {/* Hex + content */}
      <div className="relative flex flex-col items-center">
        <div className="relative">
          <ThinkingRing color={v.color} r={R} />
          <HexSvg R={R} color={v.color} bg={v.bg} active={isActive || isSelected} />

          {/* Icon */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `translate(${R * 0.1}px, ${R * 0.1}px)` }}
          >
            <svg width={R * 0.8} height={R * 0.8} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke={v.color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* Label */}
        <div className="mt-2 text-center">
          <div className="text-[11px] font-black text-white tracking-wide">{node.label}</div>
          <div className="text-[9px] text-cyan-400/60 font-mono mt-0.5">ORCHESTRATOR</div>
        </div>

        {/* Token counter */}
        <div className="mt-2 px-3 py-1.5 rounded-lg backdrop-blur-md border" style={{ background: `${v.bg}cc`, borderColor: `${v.color}44` }}>
          <div className="text-[9px] text-cyan-400/50 font-mono mb-0.5">TOKENS</div>
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-black text-cyan-300 font-mono">{fmtTok(tokenCount)}</span>
            <span className="text-[9px] text-cyan-400/40">/ 1M</span>
          </div>
          {/* Token bar */}
          <div className="mt-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (tokenCount / 1_000_000) * 100)}%`,
                background: `linear-gradient(90deg, ${v.color}88, ${v.color})`,
                boxShadow: `0 0 10px ${v.color}`,
                animation: 'pulse-glow 2s ease-in-out infinite',
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; box-shadow: 0 0 20px ${v.color}; }
        }
      `}</style>
    </div>
  )
}

// ─── Agent Hex Card ──────────────────────────────────────────────────────────

function AgentHexCard({
  node,
  isActive,
  isSelected,
  onSelect,
}: {
  node: FlowNode
  isActive: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const v = VIS[node.type] ?? VIS['assistant']
  const R = HEX_R[node.type] ?? 34

  return (
    <div
      className="absolute cursor-pointer select-none"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onClick={e => { e.stopPropagation(); onSelect(node.id) }}
    >
      {/* Cost badge */}
      {(node.cost ?? 0) > 0.00001 && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 z-10">
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-black border backdrop-blur-sm"
            style={{ background: `${v.bg}ee`, borderColor: v.color, color: v.color }}
          >
            ${(node.cost ?? 0).toFixed(3)}
          </span>
        </div>
      )}

      <div className="relative flex flex-col items-center">
        <div className="relative">
          {isActive && <ThinkingRing color={v.color} r={R} />}
          <HexSvg R={R} color={v.color} bg={v.bg} active={isActive || isSelected} />

          {/* Agent icon */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `translate(${R * 0.1}px, ${R * 0.1}px)` }}
          >
            <svg width={R * 0.6} height={R * 0.6} viewBox="0 0 24 24" fill="none" stroke={v.color} strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
        </div>

        {/* Label */}
        <div className="text-center mt-1">
          <div className="text-[10px] font-bold text-slate-200">{node.label}</div>
          <div className="text-[8px] text-slate-500 font-mono">{node.sublabel ?? 'Agent'}</div>
        </div>

        {/* Token bar */}
        {node.contextPct !== undefined && (
          <div className="w-20 mt-1">
            <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, node.contextPct)}%`, background: v.color }}
              />
            </div>
            <div className="text-[7px] text-slate-600 text-center mt-0.5 font-mono">
              {fmtTok(node.inputTokens ?? 0)} / 200k
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LLM Hex Card ────────────────────────────────────────────────────────────

function LlmHexCard({
  node,
  isActive,
  isSelected,
  onSelect,
}: {
  node: FlowNode
  isActive: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const v = VIS['llm']
  const R = HEX_R['llm'] ?? 29

  return (
    <div
      className="absolute cursor-pointer select-none"
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onClick={e => { e.stopPropagation(); onSelect(node.id) }}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative">
          {isActive && <ThinkingRing color={v.color} r={R} />}
          <HexSvg R={R} color={v.color} bg={v.bg} active={isActive || isSelected} />

          {/* LLM icon */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `translate(${R * 0.1}px, ${R * 0.1}px)` }}
          >
            <svg width={R * 0.55} height={R * 0.55} viewBox="0 0 24 24" fill="none" stroke={v.color} strokeWidth="1.5">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.45 2.1-1.17 2.83L12 12l-2.83-3.17A4 4 0 0 1 12 2z" />
              <path d="M12 12v10" />
              <path d="M8 22h8" />
              <circle cx="12" cy="6" r="1" fill={v.color} />
            </svg>
          </div>
        </div>

        <div className="text-center mt-0.5">
          <div className="text-[9px] font-bold text-sky-300">
            {(node.sublabel && node.sublabel !== 'LLM') ? node.sublabel : 'claude'}
          </div>
          {(node.llmCalls ?? node.callCount) > 0 && (
            <div className="text-[7px] text-slate-500 font-mono">
              {node.llmCalls ?? node.callCount} calls
            </div>
          )}
        </div>

        {node.contextPct !== undefined && (
          <div className="w-16 mt-1">
            <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, node.contextPct)}%`, background: v.color }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tool Call Card ──────────────────────────────────────────────────────────

function ToolCallCard({
  node,
  isActive,
  isSelected,
  onSelect,
}: {
  node: FlowNode
  isActive: boolean
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const v = VIS[node.type] ?? VIS['tool-generic']
  const content = node.content ?? ''
  const displayContent = content.length > 50 ? content.slice(0, 48) + '…' : content

  return (
    <div
      className="absolute cursor-pointer select-none transition-all duration-200"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        background: isActive ? v.bg : `${v.bg}dd`,
        border: `1px solid ${(isActive || isSelected) ? v.color : `${v.color}44`}`,
        borderRadius: 6,
        boxShadow: (isActive || isSelected) ? `0 0 20px ${v.glow}, 0 0 8px ${v.glow} inset` : 'none',
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
      }}
      onClick={e => { e.stopPropagation(); onSelect(node.id) }}
    >
      {/* Animated left accent bar */}
      {isActive && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l animate-pulse-bar"
          style={{
            background: v.color,
            boxShadow: `0 0 15px ${v.glow}`,
          }}
        />
      )}

      {/* Tool type badge */}
      <div
        className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded text-[7px] font-black border backdrop-blur-sm"
        style={{ background: `${v.bg}dd`, borderColor: v.color, color: v.color }}
      >
        {node.label}
      </div>

      <div className="flex items-center gap-2 h-full px-3 pl-4">
        <div
          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: `${v.color}22` }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={v.color} strokeWidth="2">
            <polyline points="4,17 10,11 4,5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-bold truncate" style={{ color: v.color }}>
            {node.label}
          </div>
          {displayContent && (
            <div className="text-[8px] text-slate-500 truncate font-mono mt-0.5">
              {displayContent}
            </div>
          )}
        </div>
        {node.errorCount > 0 && (
          <div className="w-4 h-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-[8px] font-black text-red-400">!</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Node Dispatch ────────────────────────────────────────────────────────────

function NodeCard({
  node,
  isActive,
  isSelected,
  onSelect,
  tokenCount = 0,
}: {
  node: FlowNode
  isActive: boolean
  isSelected: boolean
  onSelect: (id: string) => void
  tokenCount?: number
}) {
  if (node.type === 'assistant' && node.id === 'main-agent') {
    return (
      <OrchestratorHex
        node={node}
        isActive={isActive}
        isSelected={isSelected}
        onSelect={onSelect}
        tokenCount={tokenCount}
      />
    )
  }
  if (node.type === 'llm') return <LlmHexCard node={node} isActive={isActive} isSelected={isSelected} onSelect={onSelect} />
  if (node.type.startsWith('tool-')) return <ToolCallCard node={node} isActive={isActive} isSelected={isSelected} onSelect={onSelect} />
  return <AgentHexCard node={node} isActive={isActive} isSelected={isSelected} onSelect={onSelect} />
}

// ─── Edge Layer with Data Particles ──────────────────────────────────────────

const EDGE_COLORS = {
  call: '#3b82f6',
  return: '#334155',
  error: '#ef4444',
  active: '#f59e0b',
  spawn: '#818cf8',
}

function EdgeLayer({
  graph,
  visibleEdgeIds,
  activeId,
}: {
  graph: FlowGraph
  visibleEdgeIds: Set<string>
  activeId: string | null
}) {
  const nById = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes])

  function anchor(node: FlowNode, side: 'l' | 'r'): { x: number; y: number } {
    const cy = node.y + node.height / 2
    if (node.type.startsWith('tool-')) {
      return { x: side === 'l' ? node.x : node.x + node.width, y: cy }
    }
    const m = node.width * 0.16
    return { x: side === 'l' ? node.x + m : node.x + node.width - m, y: cy }
  }

  function bezierPath(src: FlowNode, tgt: FlowNode, isReturn: boolean, yOff = 0): string {
    const a = isReturn ? anchor(src, 'l') : anchor(src, 'r')
    const b = isReturn ? anchor(tgt, 'r') : anchor(tgt, 'l')
    const cpx = (a.x + b.x) / 2
    return `M${a.x},${a.y + yOff} C${cpx},${a.y + yOff} ${cpx},${b.y + yOff} ${b.x},${b.y + yOff}`
  }

  // Group parallel edges
  const pairCount = new Map<string, number>()
  const pairIdx = new Map<string, number>()
  graph.edges.forEach(e => {
    const k = `${e.sourceId}-${e.targetId}-${e.isReturn}`
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
  })

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: graph.canvasWidth,
        height: graph.canvasHeight,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <defs>
        {(['call', 'return', 'error', 'active', 'spawn'] as const).map(k => (
          <marker key={k} id={`arr-${k}`} markerWidth="24" markerHeight="20" refX="20" refY="10" orient="auto">
            <path d="M0,0 L0,18 L24,10 z" fill={EDGE_COLORS[k]} />
          </marker>
        ))}
        {/* Particle glow filter - enhanced for bright particles */}
        <filter id="particleGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Glow filter for edges */}
        <filter id="edgeGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {graph.edges.map((edge, i) => {
        const src = nById.get(edge.sourceId)
        const tgt = nById.get(edge.targetId)
        if (!src || !tgt) return null

        const visible = visibleEdgeIds.has(edge.id)
        if (!visible) return null

        const active = activeId === edge.id

        const k = `${edge.sourceId}-${edge.targetId}-${edge.isReturn}`
        const total = pairCount.get(k) ?? 1
        const idx = pairIdx.get(k) ?? 0
        pairIdx.set(k, idx + 1)
        const yOff = total > 1 ? (idx - (total - 1) / 2) * 8 : 0

        const isSpawn = edge.toolName === 'Agent'
        const col = active ? EDGE_COLORS.active
          : edge.isError ? EDGE_COLORS.error
          : isSpawn ? EDGE_COLORS.spawn
          : edge.isReturn ? EDGE_COLORS.return
          : EDGE_COLORS.call

        const arrKey = active ? 'active' : edge.isError ? 'error' : isSpawn ? 'spawn' : edge.isReturn ? 'return' : 'call'
        const d = bezierPath(src, tgt, edge.isReturn, yOff)

        return (
          <g key={`${edge.id}-${i}`}>
            {/* Glowing edge path with dash flow animation */}
            <path
              id={`ep-${edge.id}`}
              d={d}
              stroke={col}
              strokeWidth={active ? 8 : 5}
              strokeDasharray={edge.isReturn ? '12 8' : '30 15'}
              fill="none"
              markerEnd={`url(#arr-${arrKey})`}
              opacity={active ? 1 : 0.85}
              filter="url(#edgeGlow)"
              className={active ? 'edge-active' : 'edge-idle'}
            />

            {/* Bright core line */}
            <path
              d={d}
              stroke="#ffffff"
              strokeWidth={active ? 2 : 1}
              strokeDasharray="6 6"
              fill="none"
              opacity={active ? 0.9 : 0.5}
            />

            {/* Data particles - animated glowing dots traveling along path */}
            {!edge.isReturn && (
              <>
                {/* Bright glowing particle with trail effect */}
                {/* Trail circle 1 - furthest behind */}
                <circle r="8" fill={col} opacity="0.15">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    begin={`-${0.9}s`}
                    path={d}
                  />
                </circle>
                {/* Trail circle 2 */}
                <circle r="10" fill={col} opacity="0.25">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    begin={`-${0.7}s`}
                    path={d}
                  />
                </circle>
                {/* Trail circle 3 */}
                <circle r="12" fill={col} opacity="0.35">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    begin={`-${0.5}s`}
                    path={d}
                  />
                </circle>
                {/* Trail circle 4 */}
                <circle r="14" fill={col} opacity="0.5">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    begin={`-${0.3}s`}
                    path={d}
                  />
                </circle>
                {/* Main particle - bright core with intense glow */}
                <circle r="16" fill="#00f0ff" filter="url(#particleGlow)">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
                {/* Bright white core of the particle */}
                <circle r="6" fill="#ffffff" opacity="0.95">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
                {/* Extra glow aura */}
                <circle r="20" fill={col} opacity="0.3" filter="url(#particleGlow)">
                  <animateMotion
                    dur={`${1.5 + (i % 3) * 0.3}s`}
                    repeatCount="indefinite"
                    path={d}
                  />
                </circle>
              </>
            )}

            {/* Active pulse effect */}
            {active && (
              <>
                <circle r="8" fill={EDGE_COLORS.active} opacity={0.5}>
                  <animateMotion dur="0.4s" repeatCount="1" fill="freeze">
                    <mpath href={`#ep-${edge.id}`} />
                  </animateMotion>
                </circle>
                <circle r="4" fill={EDGE_COLORS.active} opacity={0.9}>
                  <animateMotion dur="0.4s" repeatCount="1" fill="freeze">
                    <mpath href={`#ep-${edge.id}`} />
                  </animateMotion>
                </circle>
              </>
            )}
          </g>
        )
      })}

      <style>{`
        @keyframes edge-flow {
          0% { stroke-dashoffset: 45; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes edge-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes pulse-bar {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .animate-pulse-bar {
          animation: pulse-bar 1s ease-in-out infinite;
        }
        .edge-idle {
          animation: edge-flow 2s linear infinite;
          stroke-dasharray: 30 15 !important;
          opacity: 0.4 !important;
        }
        .edge-active {
          animation: edge-flow 1s linear infinite, edge-pulse 0.5s ease-in-out infinite;
          stroke-dasharray: 30 15 !important;
          opacity: 0.6 !important;
        }
      `}</style>
    </svg>
  )
}

// ─── Main Canvas Component ────────────────────────────────────────────────────

interface FlowCanvasProps {
  graph: FlowGraph
  visibleNodeIds: Set<string>
  visibleEdgeIds: Set<string>
  activeId: string | null
  selectedId: string | null
  pan: { x: number; y: number }
  zoom: number
  onSelect: (id: string | null) => void
  onPanChange: (pan: { x: number; y: number }) => void
  onZoomChange: (zoom: number) => void
  containerRef: React.RefObject<HTMLDivElement>
}

export function FlowCanvas({
  graph,
  visibleNodeIds,
  visibleEdgeIds,
  activeId,
  selectedId,
  pan,
  zoom,
  onSelect,
  onPanChange,
  onZoomChange,
  containerRef,
}: FlowCanvasProps) {
  const dragRef = useRef({ active: false, sx: 0, sy: 0, px: 0, py: 0 })
  const [containerSize, setContainerSize] = useState({ w: 1142, h: 600 })

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [containerRef])

  // Mouse handlers for pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.flow-node')) return
    dragRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active) return
    onPanChange({
      x: dragRef.current.px + e.clientX - dragRef.current.sx,
      y: dragRef.current.py + e.clientY - dragRef.current.sy,
    })
  }, [onPanChange])

  const onMouseUp = useCallback(() => {
    dragRef.current.active = false
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 1.12 : 0.9
    const newZoom = Math.min(3, Math.max(0.2, zoom * delta))
    onZoomChange(newZoom)
  }, [zoom, onZoomChange])

  // Calculate total token count for orchestrator
  const totalTokens = useMemo(() => {
    return graph.nodes.reduce((sum, n) => sum + (n.inputTokens ?? 0) + (n.outputTokens ?? 0), 0)
  }, [graph])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden cursor-grab active:cursor-grabbing"
      style={{
        background: '#0a0a0c',
        height: '100%',
        width: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      onClick={() => onSelect(null)}
    >
      {/* Animated dot grid background */}
      <DotGrid width={containerSize.w * 2} height={containerSize.h * 2} />

      {/* Ambient background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 30% 50%, rgba(0, 240, 255, 0.03) 0%, transparent 50%), radial-gradient(ellipse at 70% 50%, rgba(129, 140, 248, 0.03) 0%, transparent 50%)',
        }}
      />

      {/* Transform container */}
      <div
        style={{
          position: 'absolute',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: graph.canvasWidth,
          height: graph.canvasHeight,
        }}
      >
        {/* Edge layer */}
        <EdgeLayer graph={graph} visibleEdgeIds={visibleEdgeIds} activeId={activeId} />

        {/* Node layer */}
        {graph.nodes.map(node => {
          const visible = visibleNodeIds.has(node.id)
          const isTool = node.type.startsWith('tool-')

          return (
            <div
              key={node.id}
              className="flow-node"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                opacity: visible ? 1 : 0,
                transform: visible
                  ? 'scale(1) translateY(0)'
                  : isTool
                  ? 'scale(0.8) translateY(-20px)'
                  : 'scale(0.5) translateY(-10px)',
                pointerEvents: visible ? 'auto' : 'none',
                transition: `opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)`,
              }}
            >
              <NodeCard
                node={node}
                isActive={
                  activeId !== null &&
                  graph.edges.some(e => e.id === activeId && (e.sourceId === node.id || e.targetId === node.id))
                }
                isSelected={selectedId === node.id}
                onSelect={onSelect}
                tokenCount={node.id === 'main-agent' ? totalTokens : 0}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
