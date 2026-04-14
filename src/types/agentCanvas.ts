/**
 * Agent Canvas Type Definitions
 *
 * Architecture:
 * - VirtualNode: Virtual node for call chain construction (uuid/parentUuid tree)
 * - EntityNode: Actual canvas node with entity_id
 * - CallLink: Edge connecting EntityNodes
 * - Layer: Breadth-first traversal by parentUuid tree
 * - CallGraph: Contains all virtual nodes, layers, entity nodes, and call links
 *
 * Entity ID mapping:
 * - "0" = user
 * - "1" = main_agent
 * - "2" = assistant (LLM)
 * - "call_xxx" = tool
 */

// ─── Content Type ───────────────────────────────────────────────────────────────

export type ContentType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'image'

// ─── Node Type ─────────────────────────────────────────────────────────────────

export type NodeType = 'user' | 'main_agent' | 'assistant' | 'tool'

// ─── Link Type (Edge Type) ────────────────────────────────────────────────────

export type LinkType =
  | 'thinking'       // 2 → 2 self-loop (draw arc)
  | 'agent_call'     // 2 → 1
  | 'tool_call'      // 1 → call_xxx
  | 'tool_result'    // call_xxx → 1
  | 'agent_result'   // 1 → 2
  | 'user_input'     // 0 → 1
  | 'agent_receive'  // 1 → 2
  | 'agent_response' // 2 → 1
  | 'response'       // 1 → 0

// ─── Virtual Node (Python Node equivalent) ─────────────────────────────────────

/**
 * Virtual node corresponds to Python Node.
 * Used for constructing the call chain via uuid/parentUuid.
 * Does NOT exist on the canvas.
 */
export interface VirtualNode {
  uuid: string                          // Log entry UUID
  role: 'assistant' | 'user' | 'system'
  contentType: ContentType
  toolName?: string
  parentUuid: string | null             // Parent node UUID
  children: string[]                    // Child node UUIDs
  callLinks: CallLink[]                // Edges originating from this node
}

// ─── Entity Node (Canvas Node) ─────────────────────────────────────────────────

/**
 * Entity node is the actual canvas node.
 * Corresponds to Python SubNode / EntityNode.
 * Exists on the canvas, uniquely identified by entity_id.
 */
export interface EntityNode {
  entityType: NodeType
  entityId: string                      // Unique ID: "0", "1", "2", "call_xxx"
  displayName: string
  // Position (set by layout algorithm)
  x: number
  y: number
  // Runtime state
  opacity: number
  scale: number
  state: NodeRuntimeState
}

export type NodeRuntimeState = 'idle' | 'thinking' | 'tool_calling' | 'complete' | 'error' | 'spawning' | 'fading'

// ─── Call Link (Canvas Edge) ───────────────────────────────────────────────────

/**
 * Call link connects two EntityNodes on the canvas.
 * Corresponds to Python CallLink.
 */
export interface CallLink {
  id: string                            // `${source}-${target}`
  source: string                        // entity_id
  target: string                        // entity_id
  linkType: LinkType
  opacity: number
}

// ─── Particle ─────────────────────────────────────────────────────────────────

export interface Particle {
  id: string
  edgeId: string
  progress: number                       // 0-1 position along path
  type: 'dispatch' | 'return' | 'tool_call' | 'tool_return' | 'thinking'
  color: string
  size: number
  trailLength: number
  label?: string
}

// ─── Layer ─────────────────────────────────────────────────────────────────────

/**
 * Layer = breadth-first traversal of parentUuid tree.
 * Each layer contains VirtualNodes at that depth.
 */
export interface Layer {
  level: number                          // Layer number (0 = root)
  nodes: VirtualNode[]                   // VirtualNodes at this level
}

// ─── Call Graph ────────────────────────────────────────────────────────────────

export interface CallGraph {
  // UUID → VirtualNode map
  virtualNodes: Map<string, VirtualNode>
  // Layers for traversal
  layers: Layer[]
  // EntityId → EntityNode map (canvas nodes)
  subNodes: Map<string, EntityNode>
  // All call links (edges)
  callLinks: CallLink[]
}

// ─── Simulation Event ──────────────────────────────────────────────────────────

export type SimulationEventType =
  | 'node_spawn'
  | 'edge_create'
  | 'particle_dispatch'
  | 'node_complete'
  | 'node_fade'

export interface SimulationEvent {
  time: number
  type: SimulationEventType
  payload: {
    nodeId?: string
    edgeId?: string
    particle?: Particle
    nodeType?: NodeType
    displayName?: string
    linkType?: LinkType
    source?: string
    target?: string
    toolName?: string
  }
}

// ─── Played Entry ──────────────────────────────────────────────────────────────

export interface PlayedEntry {
  index: number
  timestamp: number
  type: string
  content: string
}

// ─── Simulation State ──────────────────────────────────────────────────────────

export interface SimulationState {
  // Canvas nodes - EntityNode
  nodes: Map<string, EntityNode>
  // Node runtime states (position, opacity, scale)
  nodeStates: Map<string, NodeState>
  // Edges
  edges: Map<string, CallLink>
  // Particles
  particles: Particle[]
  // Current simulation time
  currentTime: number
  // Playback state
  isPlaying: boolean
  speed: number
  // Event index in the event queue
  eventIndex: number
  // Event queue from CallGraphBuilder
  eventQueue: SimulationEvent[]
  // Already played log entries
  playedEntries: PlayedEntry[]
  // Max time reached
  maxTimeReached: number
}

export interface NodeState {
  x: number
  y: number
  opacity: number
  scale: number
  state: NodeRuntimeState
  // For animations
  spawnTime: number
  completeTime: number
  fadeTime: number
  pulseTime: number                      // Last time this node was "hit"
}

// ─── Layout Constants ───────────────────────────────────────────────────────────

export const LAYOUT_CONSTANTS = {
  // Node sizes
  NODE_RADIUS_MAIN: 28,
  NODE_RADIUS_SUB: 20,

  // Tool slot positions (findToolSlot algorithm)
  TOOL_SLOT: {
    baseDistance: 120,
    ringIncrement: 60,
    baseSteps: 8,
    stepsPerRing: 4,
    maxRings: 3,
    fallbackDistance: 300,
  },

  // Beam (edge) drawing
  BEAM: {
    curvature: 0.15,
    parentChild: { startW: 3, endW: 1 },
    tool: { startW: 1.5, endW: 0.5 },
  },

  // Animation timing
  TIMING: {
    eventSpacing: 0.3,
    particleLifetime: 0.8,
    nodeFadeIn: 0.4,
    pulseDuration: 0.6,
    // Call sequence phases
    calleeAppear: 0.25,
    callerToCallee: 0.4,
    calleeShow: 0.6,
    calleeToCaller: 0.4,
    calleeFadeOut: 0.25,
  },
}

// ─── Color Palette ─────────────────────────────────────────────────────────────

export const COLORS = {
  // Background
  void: '#050510',
  hexGrid: '#0d0d1f',

  // Node types
  mainAgent: '#00f0ff',
  assistant: '#a855f7',
  user: '#22c55e',
  tool: '#ff8c00',

  // Node states
  idle: '#00f0ff',
  thinking: '#a855f7',
  toolCalling: '#ff8c00',
  complete: '#00ff88',
  error: '#ff4444',

  // Edges/particles
  dispatch: '#cc88ff',
  return: '#66ffaa',
  message: '#00f0ff',

  // Semantic edge colors
  SEMANTIC: {
    user_to_agent: '#88ff88',
    agent_to_llm: '#cc88ff',
    llm_to_tool: '#ffbb44',
    tool_to_llm: '#ff8866',
    llm_to_agent: '#cc88ff',
    agent_to_user: '#66ccff',
    agent_to_subagent: '#ffaa44',
    subagent_to_agent: '#ff8866',
    init: '#66ccff',
  },
}

// ─── Call Sequence (for animation) ─────────────────────────────────────────────

export type AnimationPhase =
  | 'idle'
  | 'callee_appear'
  | 'caller_to_callee'
  | 'callee_show'
  | 'callee_to_caller'
  | 'callee_fadeout'

export interface CallSequence {
  id: string
  callerId: string
  calleeId: string
  callerNode: EntityNode
  calleeNode: EntityNode
  phase: AnimationPhase
  phaseStartTime: number
  phaseDuration: number
  toolName?: string
  isComplete: boolean
}

// ─── Helper Functions ───────────────────────────────────────────────────────────

/**
 * Get node color by type
 */
export function getNodeColor(type: NodeType): string {
  switch (type) {
    case 'user': return COLORS.user
    case 'main_agent': return COLORS.mainAgent
    case 'assistant': return COLORS.assistant
    case 'tool': return COLORS.tool
    default: return COLORS.tool
  }
}

/**
 * Get edge color by link type
 */
export function getEdgeColor(linkType: LinkType): string {
  switch (linkType) {
    case 'user_input': return COLORS.SEMANTIC.user_to_agent
    case 'agent_call': return COLORS.SEMANTIC.agent_to_llm
    case 'tool_call': return COLORS.SEMANTIC.llm_to_tool
    case 'tool_result': return COLORS.SEMANTIC.tool_to_llm
    case 'agent_result': return COLORS.SEMANTIC.llm_to_agent
    case 'response': return COLORS.SEMANTIC.agent_to_user
    case 'thinking': return COLORS.SEMANTIC.agent_to_llm
    default: return COLORS.message
  }
}

/**
 * Get particle color by type
 */
export function getParticleColor(type: Particle['type']): string {
  switch (type) {
    case 'dispatch': return COLORS.dispatch
    case 'return': return COLORS.return
    case 'tool_call': return COLORS.dispatch
    case 'tool_return': return COLORS.return
    case 'thinking': return COLORS.thinking
    default: return COLORS.message
  }
}

/**
 * Create empty simulation state
 */
export function createEmptySimulationState(): SimulationState {
  return {
    nodes: new Map(),
    nodeStates: new Map(),
    edges: new Map(),
    particles: [],
    currentTime: 0,
    isPlaying: true,
    speed: 1,
    eventIndex: 0,
    eventQueue: [],
    playedEntries: [],
    maxTimeReached: 0,
  }
}
