/**
 * Event processor for simulation events.
 */

import type { SimulationState, Agent, ToolCallNode, Edge, Particle, VisualEffect, TimelineEntry, SimulationEvent } from './types'
import { ANIM_SPEED } from '../lib/canvas-constants'
import { COLORS } from '../lib/colors'

let particleIdCounter = 0
let effectIdCounter = 0

export function processEvent(state: SimulationState, event: SimulationEvent): SimulationState {
  const newAgents = new Map(state.agents)
  const newToolCalls = new Map(state.toolCalls)
  let newParticles = [...state.particles]
  let newEdges = [...state.edges]
  let newEffects = [...state.effects]
  const newTimelineEntries = new Map(state.timelineEntries)

  switch (event.type) {
    case 'agent_spawn': {
      const { id, name, parentId, isMain, x, y } = event.payload as any
      const agent: Agent = {
        id,
        name,
        state: 'idle',
        parentId: parentId || null,
        tokensUsed: 0,
        tokensMax: 1000000,
        contextBreakdown: { systemPrompt: 0, userMessages: 0, toolResults: 0, reasoning: 0, subagentResults: 0 },
        toolCalls: 0,
        timeAlive: 0,
        x,
        y,
        vx: 0,
        vy: 0,
        pinned: false,
        isMain: isMain || false,
        spawnTime: state.currentTime,
        opacity: 0,
        scale: 0.5,
        messageBubbles: [],
      }
      newAgents.set(id, agent)

      // Create edge from parent
      if (parentId) {
        const edge: Edge = {
          id: `edge-${parentId}-${id}`,
          from: parentId,
          to: id,
          type: 'parent-child',
          opacity: 0,
        }
        newEdges.push(edge)
      }

      // Spawn effect
      const effect: VisualEffect = {
        id: `effect-${effectIdCounter++}`,
        type: 'spawn',
        x,
        y,
        age: 0,
        duration: 0.8,
      }
      newEffects.push(effect)

      // Timeline entry
      const timelineEntry: TimelineEntry = {
        id,
        agentId: id,
        agentName: name,
        startTime: state.currentTime,
        blocks: [],
      }
      newTimelineEntries.set(id, timelineEntry)
      break
    }

    case 'agent_thinking': {
      const { id, thinking } = event.payload as any
      const agent = state.agents.get(id)
      if (agent) {
        const updatedAgent: Agent = {
          ...agent,
          state: 'thinking',
          messageBubbles: thinking
            ? [...agent.messageBubbles, { text: thinking, time: state.currentTime, role: 'thinking' as const }]
            : agent.messageBubbles,
        }
        newAgents.set(id, updatedAgent)
        // Update timeline
        const entry = newTimelineEntries.get(id)
        if (entry) {
          newTimelineEntries.set(id, {
            ...entry,
            blocks: [...entry.blocks, {
              id: `block-${id}-${entry.blocks.length}`,
              type: 'thinking',
              startTime: state.currentTime,
              label: 'Thinking',
              color: COLORS.thinking,
            }],
          })
        }
      }
      break
    }

    case 'agent_tool_call': {
      const { id } = event.payload as any
      const agent = state.agents.get(id)
      if (agent) {
        newAgents.set(id, { ...agent, state: 'tool_calling' })
        // Update timeline
        const entry = newTimelineEntries.get(id)
        if (entry) {
          newTimelineEntries.set(id, {
            ...entry,
            blocks: [...entry.blocks, {
              id: `block-${id}-${entry.blocks.length}`,
              type: 'tool_call',
              startTime: state.currentTime,
              label: 'Tool Call',
              color: COLORS.tool_calling,
            }],
          })
        }
      }
      break
    }

    case 'tool_call_start': {
      const { id, agentId, toolName, args, x, y } = event.payload as any
      const tool: ToolCallNode = {
        id,
        agentId,
        toolName,
        args,
        state: 'running',
        x,
        y,
        startTime: state.currentTime,
        opacity: 0,
      }
      newToolCalls.set(id, tool)

      // Set agent to tool_calling
      const agent = state.agents.get(agentId)
      if (agent) {
        newAgents.set(agentId, {
          ...agent,
          state: 'tool_calling',
          currentTool: toolName,
          toolCalls: agent.toolCalls + 1,
        })
      }
      break
    }

    case 'tool_call_end': {
      const { id, result } = event.payload as any
      const tool = state.toolCalls.get(id)
      if (tool) {
        newToolCalls.set(id, {
          ...tool,
          state: 'complete',
          result,
          completeTime: state.currentTime,
        })
      }
      break
    }

    case 'particle_spawn': {
      const { id, edgeId, type, color } = event.payload as any
      const particle: Particle = {
        id: id || `particle-${particleIdCounter++}`,
        edgeId,
        progress: 0,
        type,
        color: color || (type === 'dispatch' ? COLORS.dispatch : COLORS.return),
        size: 4,
        trailLength: 8,
      }
      newParticles.push(particle)
      break
    }

    case 'agent_complete': {
      const { id } = event.payload as any
      const agent = state.agents.get(id)
      if (agent) {
        newAgents.set(id, {
          ...agent,
          state: 'complete',
          completeTime: state.currentTime,
        })
        // Complete effect
        const effect: VisualEffect = {
          id: `effect-${effectIdCounter++}`,
          type: 'complete',
          x: agent.x,
          y: agent.y,
          age: 0,
          duration: 1.0,
        }
        newEffects.push(effect)
        // Update timeline
        const entry = newTimelineEntries.get(id)
        if (entry) {
          const lastBlock = entry.blocks[entry.blocks.length - 1]
          const updatedBlocks = lastBlock && !lastBlock.endTime
            ? [...entry.blocks.slice(0, -1), { ...lastBlock, endTime: state.currentTime }]
            : entry.blocks
          newTimelineEntries.set(id, {
            ...entry,
            blocks: [...updatedBlocks, {
              id: `block-${id}-${entry.blocks.length}`,
              type: 'complete',
              startTime: state.currentTime,
              label: 'Complete',
              color: COLORS.complete,
            }],
          })
        }
      }
      break
    }

    case 'agent_idle': {
      const { id } = event.payload as any
      const agent = state.agents.get(id)
      if (agent) {
        newAgents.set(id, { ...agent, state: 'idle' })
      }
      break
    }
  }

  return {
    ...state,
    agents: newAgents,
    toolCalls: newToolCalls,
    particles: newParticles,
    edges: newEdges,
    effects: newEffects,
    timelineEntries: newTimelineEntries,
  }
}

export function computeNextFrame(
  state: SimulationState,
  deltaTime: number,
): SimulationState {
  const dt = Math.min(deltaTime, ANIM_SPEED.maxDeltaTime)

  // Update agents (fade in, scale) - create new map with updated agents
  const newAgents = new Map<string, Agent>()
  for (const [id, agent] of state.agents) {
    newAgents.set(id, {
      ...agent,
      opacity: Math.min(1, agent.opacity + dt * ANIM_SPEED.agentFadeIn),
      scale: Math.min(1, agent.scale + dt * ANIM_SPEED.agentScaleIn),
      timeAlive: agent.timeAlive + dt,
    })
  }

  // Update tool calls (fade in)
  const newToolCalls = new Map<string, ToolCallNode>()
  for (const [id, tool] of state.toolCalls) {
    newToolCalls.set(id, {
      ...tool,
      opacity: Math.min(1, tool.opacity + dt * ANIM_SPEED.toolFadeIn),
    })
  }

  // Update particles (move along path)
  const newParticles = state.particles
    .map(particle => ({
      ...particle,
      progress: particle.progress + dt * ANIM_SPEED.particleSpeed * 0.3,
    }))
    .filter(p => p.progress < 1)

  // Update edges (fade in)
  const newEdges = state.edges.map(edge => ({
    ...edge,
    opacity: Math.min(1, edge.opacity + dt * ANIM_SPEED.edgeFadeIn * 0.1),
  }))

  // Update effects (age)
  const newEffects = state.effects
    .filter(effect => {
      const agedEffect = { ...effect, age: effect.age + dt }
      return agedEffect.age < effect.duration
    })
    .map(effect => ({ ...effect, age: effect.age + dt }))

  return {
    ...state,
    agents: newAgents,
    toolCalls: newToolCalls,
    particles: newParticles,
    edges: newEdges,
    effects: newEffects,
    currentTime: state.currentTime + dt * state.speed,
    maxTimeReached: Math.max(state.maxTimeReached, state.currentTime),
  }
}
