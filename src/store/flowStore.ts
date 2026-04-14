import { create } from 'zustand'
import type { FlowGraph } from '../types/flow'
import type { MergedEdge } from '../types/flow'

// Helper to rebuild merged edges
function buildMergedEdges(edges: FlowGraph['edges']): MergedEdge[] {
  const m = new Map<string, MergedEdge>()
  edges.forEach(e => {
    const k = `${e.sourceId}||${e.targetId}||${e.isReturn}`
    if (!m.has(k)) {
      m.set(k, { id: k, sourceId: e.sourceId, targetId: e.targetId, isReturn: e.isReturn, isError: false, callCount: 0, errorCount: 0 })
    }
    const r = m.get(k)!
    r.callCount++
    if (e.isError) { r.errorCount++; r.isError = true }
  })
  return [...m.values()]
}

export type NodeState = 'idle' | 'thinking' | 'tool-call' | 'error' | 'complete'

export interface TimelineEvent {
  id: string
  agentId: string
  agentLabel: string
  startTime: number
  endTime: number
  state: NodeState
  toolName?: string
}

export interface ActivityLogEntry {
  id: string
  timestamp: number
  type: 'command' | 'file' | 'search' | 'result' | 'error' | 'spawn' | 'complete'
  message: string
  details?: string
  isError?: boolean
}

interface FlowStore {
  // Graph data
  graph: FlowGraph | null

  // View state
  mode: 'full' | 'replay'
  streamingMode: 'replay' | 'live'
  replayIdx: number
  playing: boolean
  speed: number

  // Selection & interaction
  activeId: string | null
  selectedId: string | null

  // Transform
  pan: { x: number; y: number }
  zoom: number

  // Node states (for animations)
  nodeStates: Record<string, NodeState>

  // Timeline events
  timelineEvents: TimelineEvent[]

  // Activity log
  activityLog: ActivityLogEntry[]
  agentState: string

  // Actions
  setGraph: (graph: FlowGraph) => void
  setMode: (mode: 'full' | 'replay') => void
  setStreamingMode: (mode: 'replay' | 'live') => void
  setReplayIdx: (idx: number) => void
  setPlaying: (playing: boolean) => void
  setSpeed: (speed: number) => void
  setActiveId: (id: string | null) => void
  setSelectedId: (id: string | null) => void
  setPan: (pan: { x: number; y: number }) => void
  setZoom: (zoom: number) => void
  setNodeState: (nodeId: string, state: NodeState) => void
  addActivityLog: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => void
  setAgentState: (state: string) => void
  stepReplay: () => void
  resetReplay: () => void

  // Streaming updates
  addEdge: (edge: FlowGraph['edges'][0]) => void
  addNode: (node: FlowGraph['nodes'][0]) => void
  updateNode: (nodeId: string, updates: Partial<FlowGraph['nodes'][0]>) => void
}

const AGENT_STATES = [
  'Deliberating',
  'Analyzing',
  'Working',
  'Processing',
  'Thinking',
  'Planning',
  'Executing',
  'Reviewing',
  'Optimizing',
  'Learning',
]

let logIdCounter = 0

export const useFlowStore = create<FlowStore>((set, get) => ({
  graph: null,
  mode: 'full',
  streamingMode: 'replay',
  replayIdx: -1,
  playing: false,
  speed: 1000,
  activeId: null,
  selectedId: null,
  pan: { x: 40, y: 40 },
  zoom: 1,
  nodeStates: {},
  timelineEvents: [],
  activityLog: [],
  agentState: AGENT_STATES[0],

  setGraph: (graph) => set({ graph }),

  setMode: (mode) => set({ mode, replayIdx: -1, playing: false, activeId: null }),

  setStreamingMode: (streamingMode) => set({ streamingMode }),

  setReplayIdx: (replayIdx) => {
    const { graph, speed } = get()
    if (!graph) return

    const edges = [...graph.edges].sort((a, b) => a.entryIndex - b.entryIndex)
    if (replayIdx >= 0 && replayIdx < edges.length) {
      const edge = edges[replayIdx]
      set({ activeId: edge.id })

      // Auto-clear active after 65% of speed
      setTimeout(() => {
        set({ activeId: null })
      }, Math.min(speed * 0.65, 550))
    }
    set({ replayIdx })
  },

  setPlaying: (playing) => set({ playing }),

  setSpeed: (speed) => set({ speed }),

  setActiveId: (activeId) => set({ activeId }),

  setSelectedId: (selectedId) => set({ selectedId }),

  setPan: (pan) => set({ pan }),

  setZoom: (zoom) => set({ zoom: Math.min(3, Math.max(0.2, zoom)) }),

  setNodeState: (nodeId, state) =>
    set((s) => ({ nodeStates: { ...s.nodeStates, [nodeId]: state } })),

  addActivityLog: (entry) =>
    set((s) => ({
      activityLog: [
        ...s.activityLog,
        { ...entry, id: `log-${++logIdCounter}`, timestamp: Date.now() },
      ].slice(-100), // Keep last 100 entries
    })),

  setAgentState: (agentState) => set({ agentState }),

  stepReplay: () => {
    const { replayIdx, graph } = get()
    if (!graph) return
    const edges = [...graph.edges].sort((a, b) => a.entryIndex - b.entryIndex)
    const nextIdx = Math.min(replayIdx + 1, edges.length - 1)
    if (nextIdx >= 0 && nextIdx !== replayIdx) {
      get().setReplayIdx(nextIdx)
    }
  },

  resetReplay: () =>
    set({ replayIdx: -1, playing: false, activeId: null }),

  // Streaming update methods
  addEdge: (edge) =>
    set((s) => {
      if (!s.graph) return s
      return {
        graph: {
          ...s.graph,
          edges: [...s.graph.edges, edge],
          mergedEdges: buildMergedEdges([...s.graph.edges, edge]),
        },
      }
    }),

  addNode: (node) =>
    set((s) => {
      if (!s.graph) return s
      return {
        graph: {
          ...s.graph,
          nodes: [...s.graph.nodes, node],
        },
      }
    }),

  updateNode: (nodeId, updates) =>
    set((s) => {
      if (!s.graph) return s
      return {
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n) =>
            n.id === nodeId ? { ...n, ...updates } : n
          ),
        },
      }
    }),
}))

// Hook to cycle agent state for typewriter effect
export function useAgentStateCycler() {
  const { setAgentState, agentState } = useFlowStore()
  const idx = AGENT_STATES.indexOf(agentState)

  const cycle = () => {
    const nextIdx = (idx + 1) % AGENT_STATES.length
    setAgentState(AGENT_STATES[nextIdx])
  }

  return { agentState, cycle, idx }
}
