import { useMemo, useEffect, useState, useRef } from 'react'
import type { FlowGraph } from '../types/flow'
import { useFlowStore, type TimelineEvent, type NodeState } from '../store/flowStore'

// ─── Timeline Event Types ─────────────────────────────────────────────────────

const STATE_COLORS: Record<NodeState, { bg: string; border: string; label: string }> = {
  idle: { bg: '#1e293b', border: '#475569', label: 'Idle' },
  thinking: { bg: '#1e3a5f', border: '#3b82f6', label: 'Thinking' },
  'tool-call': { bg: '#78350f', border: '#f59e0b', label: 'Tool' },
  error: { bg: '#7f1d1d', border: '#ef4444', label: 'Error' },
  complete: { bg: '#14532d', border: '#22c55e', label: 'Done' },
}

// ─── Timeline Row ─────────────────────────────────────────────────────────────

interface TimelineRowProps {
  agentId: string
  agentLabel: string
  events: TimelineEvent[]
  startTime: number
  endTime: number
  totalDuration: number
  isActive: boolean
}

function TimelineRow({
  agentId: _agentId,
  agentLabel,
  events,
  startTime,
  endTime,
  totalDuration: _totalDuration,
  isActive,
}: TimelineRowProps) {
  const totalMs = endTime - startTime

  return (
    <div className="flex items-center h-8 border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
      {/* Agent label */}
      <div
        className="flex-shrink-0 px-3 w-40 border-r border-slate-800"
        style={{ background: isActive ? '#0a0a0c' : 'transparent' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: isActive ? '#00f0ff' : '#475569' }}
          />
          <span className="text-[10px] font-bold text-slate-300 truncate">
            {agentLabel}
          </span>
        </div>
      </div>

      {/* Timeline bar area */}
      <div className="flex-1 relative h-full" style={{ background: '#0a0a0c' }}>
        {/* Grid lines */}
        <div className="absolute inset-0 flex items-center">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-slate-800/30"
              style={{ height: '100%' }}
            />
          ))}
        </div>

        {/* Event blocks */}
        {events.map((event) => {
          const startPct = ((event.startTime - startTime) / totalMs) * 100
          const widthPct = ((event.endTime - event.startTime) / totalMs) * 100
          const colors = STATE_COLORS[event.state]

          return (
            <div
              key={event.id}
              className="absolute top-1 bottom-1 rounded transition-all duration-200 cursor-pointer hover:brightness-125"
              style={{
                left: `${Math.max(0, startPct)}%`,
                width: `${Math.min(100 - startPct, widthPct)}%`,
                background: colors.bg,
                borderLeft: `2px solid ${colors.border}`,
                boxShadow: event.state !== 'idle' ? `0 0 8px ${colors.border}40` : 'none',
              }}
              title={`${colors.label}: ${event.toolName ?? event.state}`}
            >
              {widthPct > 3 && (
                <span className="text-[8px] font-bold text-slate-300 px-1 truncate block leading-8">
                  {event.toolName ?? colors.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Timeline Header ──────────────────────────────────────────────────────────

function TimelineHeader({
  startTime: _startTime,
  endTime: _endTime,
  totalDuration,
  currentPct,
}: {
  startTime: number
  endTime: number
  totalDuration: number
  currentPct: number
}) {
  const markers = useMemo(() => {
    const count = 10
    return Array.from({ length: count + 1 }, (_, i) => {
      const pct = (i / count) * 100
      const ms = (pct / 100) * totalDuration
      const secs = Math.floor(ms / 1000)
      return { pct, label: secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s` }
    })
  }, [totalDuration])

  return (
    <div className="relative h-6 border-b border-slate-700 flex items-stretch">
      {/* Time labels */}
      <div className="w-40 flex-shrink-0 border-r border-slate-800" />
      <div className="flex-1 relative">
        {markers.map(({ pct, label }) => (
          <div
            key={pct}
            className="absolute top-0 bottom-0 flex items-center"
            style={{ left: `${pct}%` }}
          >
            <span className="text-[8px] text-slate-500 font-mono -translate-x-1/2">
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 z-10"
        style={{ left: `${currentPct}%` }}
      >
        <div
          className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
          style={{
            background: '#00f0ff',
            boxShadow: '0 0 10px #00f0ff, 0 0 20px #00f0ff60',
            animation: 'playhead-pulse 1s ease-in-out infinite',
          }}
        />
        <div className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-cyan-300 to-cyan-400" />
      </div>
    </div>
  )
}

// ─── Main Timeline Component ──────────────────────────────────────────────────

interface FlowTimelineProps {
  graph: FlowGraph
  replayIdx: number
  isPlaying: boolean
}

export function FlowTimeline({ graph, replayIdx, isPlaying }: FlowTimelineProps) {
  const { agentState } = useFlowStore()
  const [currentPct, setCurrentPct] = useState(0)
  const rafRef = useRef<number>()
  const startTimeRef = useRef<number>(Date.now())

  // Build timeline events from graph
  const events = useMemo(() => {
    const evts: TimelineEvent[] = []
    const agentRows = new Map<string, { start: number; events: TimelineEvent[] }>()

    // Group edges by agent
    graph.edges.forEach((edge) => {
      if (edge.entryIndex < 0) return

      const agentId = edge.sourceId.startsWith('sa-') ? edge.sourceId : 'main-agent'
      const agentNode = graph.nodes.find(n => n.id === agentId)

      if (!agentRows.has(agentId)) {
        agentRows.set(agentId, { start: edge.entryIndex, events: [] })
      }

      const state: NodeState = edge.isError ? 'error' : edge.isReturn ? 'complete' : 'tool-call'

      evts.push({
        id: `evt-${edge.id}`,
        agentId,
        agentLabel: agentNode?.label ?? agentId,
        startTime: edge.entryIndex,
        endTime: edge.entryIndex + 1,
        state,
        toolName: edge.toolName,
      })
    })

    return evts
  }, [graph])

  // Group events by agent
  const eventsByAgent = useMemo(() => {
    const grouped = new Map<string, TimelineEvent[]>()
    events.forEach(evt => {
      if (!grouped.has(evt.agentId)) {
        grouped.set(evt.agentId, [])
      }
      grouped.get(evt.agentId)!.push(evt)
    })
    return grouped
  }, [events])

  // Timeline bounds
  const { startTime, endTime, totalDuration } = useMemo(() => {
    if (events.length === 0) {
      return { startTime: 0, endTime: 100, totalDuration: 100 }
    }
    const times = events.flatMap(e => [e.startTime, e.endTime])
    const min = Math.min(...times)
    const max = Math.max(...times)
    return { startTime: min, endTime: max, totalDuration: max - min || 1 }
  }, [events])

  // Animate playhead
  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = Date.now()
      let frame: number
      const animate = () => {
        const elapsed = Date.now() - startTimeRef.current
        const progress = Math.min(1, elapsed / (totalDuration * 10)) // 10x speed
        setCurrentPct(progress * 100)
        if (progress < 1) {
          frame = requestAnimationFrame(animate)
        }
        rafRef.current = frame
      }
      frame = requestAnimationFrame(animate)
      return () => cancelAnimationFrame(frame)
    } else {
      setCurrentPct((replayIdx / (graph.edges.length || 1)) * 100)
    }
  }, [isPlaying, replayIdx, totalDuration, graph.edges.length])

  const agents = useMemo(() => {
    return Array.from(eventsByAgent.entries()).map(([agentId, evts]) => ({
      id: agentId,
      label: evts[0]?.agentLabel ?? agentId,
      events: evts,
    }))
  }, [eventsByAgent])

  return (
    <div className="h-[150px] bg-[#0a0a0c] border-t border-slate-800 flex flex-col overflow-hidden">
      {/* Header with time markers */}
      <TimelineHeader
        startTime={startTime}
        endTime={endTime}
        totalDuration={totalDuration}
        currentPct={currentPct}
      />

      {/* Timeline rows */}
      <div className="flex-1 overflow-y-auto">
        {agents.map(({ id, label, events }) => (
          <TimelineRow
            key={id}
            agentId={id}
            agentLabel={label}
            events={events}
            startTime={startTime}
            endTime={endTime}
            totalDuration={totalDuration}
            isActive={false}
          />
        ))}

        {agents.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs">
            No timeline data available
          </div>
        )}
      </div>

      {/* State legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-slate-800/50 bg-[#050508]">
        {Object.entries(STATE_COLORS).map(([state, { border, label }]) => (
          <div key={state} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ background: border, boxShadow: `0 0 6px ${border}60` }}
            />
            <span className="text-[9px] text-slate-500 font-medium">{label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[9px] text-cyan-400 font-bold">{agentState}</span>
        </div>
      </div>
      <style>{`
        @keyframes playhead-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
