/**
 * Simulation types for agent visualization.
 */

import type { AgentState } from '../lib/colors'

export interface ContextBreakdown {
  systemPrompt: number
  userMessages: number
  toolResults: number
  reasoning: number
  subagentResults: number
}

export interface Agent {
  id: string
  name: string
  state: AgentState
  parentId: string | null
  tokensUsed: number
  tokensMax: number
  contextBreakdown: ContextBreakdown
  toolCalls: number
  timeAlive: number
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
  isMain: boolean
  currentTool?: string
  task?: string
  spawnTime: number
  completeTime?: number
  opacity: number
  scale: number
  messageBubbles: MessageBubble[]
}

export interface MessageBubble {
  text: string
  time: number
  role: 'assistant' | 'thinking' | 'user'
}

export interface ToolCallNode {
  id: string
  agentId: string
  toolName: string
  state: 'running' | 'complete' | 'error'
  args: string
  result?: string
  tokenCost?: number
  x: number
  y: number
  startTime: number
  completeTime?: number
  opacity: number
}

export interface Edge {
  id: string
  from: string
  to: string
  type: 'parent-child' | 'tool'
  opacity: number
}

export interface Particle {
  id: string
  edgeId: string
  progress: number
  type: 'dispatch' | 'return' | 'tool_call' | 'tool_return' | 'message'
  color: string
  size: number
  trailLength: number
  label?: string
}

export interface VisualEffect {
  id: string
  type: 'spawn' | 'complete' | 'shatter'
  x: number
  y: number
  age: number
  duration: number
}

export interface SimulationEvent {
  time: number
  type:
    | 'agent_spawn'
    | 'agent_complete'
    | 'agent_idle'
    | 'agent_thinking'
    | 'agent_tool_call'
    | 'message'
    | 'tool_call_start'
    | 'tool_call_end'
    | 'subagent_dispatch'
    | 'subagent_return'
    | 'particle_spawn'
  payload: Record<string, unknown>
}

export interface TimelineEntry {
  id: string
  agentId: string
  agentName: string
  startTime: number
  endTime?: number
  blocks: TimelineBlock[]
}

export interface TimelineBlock {
  id: string
  type: 'thinking' | 'tool_call' | 'idle' | 'complete'
  startTime: number
  endTime?: number
  label: string
  color: string
}

export interface SimulationState {
  agents: Map<string, Agent>
  toolCalls: Map<string, ToolCallNode>
  particles: Particle[]
  edges: Edge[]
  effects: VisualEffect[]
  timelineEntries: Map<string, TimelineEntry>
  currentTime: number
  maxTimeReached: number
  isPlaying: boolean
  speed: number
  eventIndex: number
}

export function createEmptyState(): SimulationState {
  return {
    agents: new Map(),
    toolCalls: new Map(),
    particles: [],
    edges: [],
    effects: [],
    timelineEntries: new Map(),
    currentTime: 0,
    maxTimeReached: 0,
    isPlaying: true,
    speed: 1,
    eventIndex: 0,
  }
}
