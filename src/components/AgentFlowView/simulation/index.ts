/**
 * useAgentSimulation Hook
 *
 * Manages simulation state, event processing, and animation frame computation.
 * Uses CallGraphBuilder to build the call graph from log entries.
 */

import { useCallback, useRef, useState } from 'react'
import type {
  SimulationState,
  EntityNode,
  Particle,
  CallSequence,
} from '../../../types/agentCanvas'
import { createEmptySimulationState, LAYOUT_CONSTANTS } from '../../../types/agentCanvas'
import { CallGraphBuilder, findToolSlot } from './call-graph'
import type { LogEntry } from '../../../types/log'

// ─── Animation Constants ─────────────────────────────────────────────────────────

const { TIMING } = LAYOUT_CONSTANTS

// ─── Helper Types ───────────────────────────────────────────────────────────────

interface ActiveNode {
  id: string
  node: EntityNode
  opacity: number
  scale: number
  state: EntityNode['state']
  spawnTime: number
  completeTime: number
  fadeTime: number
  pulseTime: number
  x: number
  y: number
}

interface ActiveParticle {
  id: string
  edgeId: string
  birthTime: number
  progress: number
  type: Particle['type']
  color: string
  size: number
  fromNode?: EntityNode
  toNode?: EntityNode
  direction?: 'forward' | 'backward'
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAgentSimulation() {
  // Simulation state
  const [state, setState] = useState<SimulationState>(createEmptySimulationState)

  // Animation refs (to avoid closure issues)
  const stateRef = useRef<SimulationState>(createEmptySimulationState())
  const lastTimeRef = useRef<number>(0)
  const currentTimeRef = useRef<number>(0)
  const eventIndexRef = useRef<number>(0)
  const activeNodesRef = useRef<Map<string, ActiveNode>>(new Map())
  const activeParticlesRef = useRef<ActiveParticle[]>([])
  const callSequencesRef = useRef<CallSequence[]>([])
  const particleIdRef = useRef<number>(0)

  // Keep stateRef in sync
  const updateStateRef = useCallback((newState: Partial<SimulationState>) => {
    stateRef.current = { ...stateRef.current, ...newState }
    setState({ ...stateRef.current })
  }, [])

  // ─── Initialize simulation from log entries ──────────────────────────────────

  const initializeFromEntries = useCallback((entries: LogEntry[]) => {
    const builder = new CallGraphBuilder()
    const events = builder.buildCallGraph(entries)
    const entityNodes = builder.getEntityNodes()

    // Initialize positions
    const canvasWidth = 800
    const canvasHeight = 600
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2

    builder.initializePositions(canvasWidth, canvasHeight, centerX, centerY)

    // Build active nodes map
    const activeNodes = new Map<string, ActiveNode>()
    entityNodes.forEach((node, id) => {
      activeNodes.set(id, {
        id,
        node,
        opacity: 0,
        scale: 0.55,
        state: 'idle',
        spawnTime: 0,
        completeTime: 0,
        fadeTime: 9999,
        pulseTime: -9999,
        x: node.x,
        y: node.y,
      })
    })

    // Position tool nodes using findToolSlot
    const mainAgent = activeNodes.get('1')
    if (mainAgent) {
      const positionedTools = new Map<string, { entityId: string; x: number; y: number; parentId: string | null }>()
      entityNodes.forEach((node, id) => {
        if (node.entityType === 'tool') {
          const pos = findToolSlot(
            { entityId: id, x: mainAgent.x, y: mainAgent.y, parentId: '1' },
            new Map([['1', { entityId: '1', x: mainAgent.x, y: mainAgent.y, parentId: null }]]),
            positionedTools
          )
          node.x = pos.x
          node.y = pos.y
          positionedTools.set(id, { entityId: id, x: pos.x, y: pos.y, parentId: null })

          const activeNode = activeNodes.get(id)
          if (activeNode) {
            activeNode.x = pos.x
            activeNode.y = pos.y
          }
        }
      })
    }

    // Reset state
    stateRef.current = {
      ...createEmptySimulationState(),
      nodes: entityNodes,
      eventQueue: events,
      isPlaying: true,
      speed: 1,
    }
    activeNodesRef.current = activeNodes
    activeParticlesRef.current = []
    callSequencesRef.current = []
    eventIndexRef.current = 0
    currentTimeRef.current = 0
    lastTimeRef.current = 0
    particleIdRef.current = 0

    setState({ ...stateRef.current })
    return events
  }, [])

  // ─── Process events ─────────────────────────────────────────────────────────

  const processEvents = useCallback((currentTime: number) => {
    const events = stateRef.current.eventQueue
    const nodesMap = activeNodesRef.current

    while (eventIndexRef.current < events.length && events[eventIndexRef.current].time <= currentTime) {
      const event = events[eventIndexRef.current]
      eventIndexRef.current++

      switch (event.type) {
        case 'node_spawn': {
          const nodeId = event.payload.nodeId
          if (nodeId) {
            const activeNode = nodesMap.get(nodeId)
            if (activeNode) {
              activeNode.spawnTime = currentTime
              activeNode.opacity = 0
              activeNode.scale = 0.55
              activeNode.state = 'spawning'
            }
          }
          break
        }

        case 'edge_create': {
          const { source, target } = event.payload
          if (source && target) {
            // Start a new call sequence
            const caller = nodesMap.get(source)
            const callee = nodesMap.get(target)

            if (caller && callee) {
              const seq: CallSequence = {
                id: `seq-${callSequencesRef.current.length}`,
                callerId: source,
                calleeId: target,
                callerNode: caller.node,
                calleeNode: callee.node,
                phase: 'callee_appear',
                phaseStartTime: currentTime,
                phaseDuration: TIMING.calleeAppear,
                toolName: event.payload.toolName,
                isComplete: false,
              }
              callSequencesRef.current.push(seq)
            }
          }
          break
        }

        case 'particle_dispatch': {
          const particle = event.payload.particle
          if (particle) {
            const fromNode = nodesMap.get(particle.edgeId.split('-')[0])
            const toNode = nodesMap.get(particle.edgeId.split('-')[1])

            activeParticlesRef.current.push({
              id: particle.id,
              edgeId: particle.edgeId,
              birthTime: currentTime,
              progress: 0,
              type: particle.type,
              color: particle.color,
              size: particle.size,
              fromNode: fromNode?.node,
              toNode: toNode?.node,
              direction: particle.type === 'return' ? 'backward' : 'forward',
            })
          }
          break
        }
      }
    }
  }, [])

  // ─── Update call sequences ───────────────────────────────────────────────────

  const updateCallSequences = useCallback((currentTime: number) => {
    for (const seq of callSequencesRef.current) {
      if (seq.isComplete) continue

      const elapsed = currentTime - seq.phaseStartTime

      if (elapsed >= seq.phaseDuration) {
        // Advance to next phase
        switch (seq.phase) {
          case 'callee_appear':
            seq.phase = 'caller_to_callee'
            seq.phaseStartTime = currentTime
            seq.phaseDuration = TIMING.callerToCallee
            // Spawn particle going from caller to callee
            spawnParticle(seq.callerId, seq.calleeId, 'dispatch', currentTime)
            break

          case 'caller_to_callee':
            seq.phase = 'callee_show'
            seq.phaseStartTime = currentTime
            seq.phaseDuration = TIMING.calleeShow
            break

          case 'callee_show':
            seq.phase = 'callee_to_caller'
            seq.phaseStartTime = currentTime
            seq.phaseDuration = TIMING.calleeToCaller
            // Spawn particle going from callee back to caller
            spawnParticle(seq.calleeId, seq.callerId, 'return', currentTime)
            break

          case 'callee_to_caller':
            seq.phase = 'callee_fadeout'
            seq.phaseStartTime = currentTime
            seq.phaseDuration = TIMING.calleeFadeOut
            break

          case 'callee_fadeout':
            seq.isComplete = true
            break
        }
      }
    }
  }, [])

  const spawnParticle = (
    fromId: string,
    toId: string,
    type: Particle['type'],
    currentTime: number
  ) => {
    const fromNode = activeNodesRef.current.get(fromId)
    const toNode = activeNodesRef.current.get(toId)

    if (!fromNode || !toNode) return

    const color = type === 'dispatch' ? '#cc88ff' : '#66ffaa'

    activeParticlesRef.current.push({
      id: `p${particleIdRef.current++}`,
      edgeId: `${fromId}-${toId}`,
      birthTime: currentTime,
      progress: 0,
      type,
      color,
      size: 5,
      fromNode: fromNode.node,
      toNode: toNode.node,
      direction: type === 'dispatch' ? 'forward' : 'backward',
    })
  }

  // ─── Update node states ─────────────────────────────────────────────────────

  const updateNodeStates = useCallback((currentTime: number) => {
    const activeSeq = [...callSequencesRef.current].reverse().find(s => !s.isComplete)
    const nodesMap = activeNodesRef.current

    for (const [, n] of nodesMap) {
      if (currentTime < n.spawnTime) {
        n.opacity = 0
        n.scale = 0.55
        n.state = 'spawning'
        continue
      }

      const isMainAgent = n.node.entityId === '1'
      const isInActiveSeq = activeSeq && (activeSeq.callerId === n.node.entityId || activeSeq.calleeId === n.node.entityId)
      const isCallee = activeSeq && activeSeq.calleeId === n.node.entityId

      if (isInActiveSeq && activeSeq) {
        const seqElapsed = currentTime - activeSeq.phaseStartTime
        const seqProgress = Math.min(1, seqElapsed / activeSeq.phaseDuration)

        switch (activeSeq.phase) {
          case 'callee_appear':
            if (isCallee) {
              n.opacity = seqProgress * 1.0
              n.scale = 0.55 + seqProgress * 0.5
              n.state = 'spawning'
            } else if (isMainAgent) {
              n.opacity = 0.6
              n.scale = 0.75
              n.state = 'thinking'
            }
            break

          case 'caller_to_callee':
            if (isCallee) {
              n.opacity = 1.0
              n.scale = 1.05
              n.state = 'tool_calling'
            } else if (isMainAgent) {
              n.opacity = 0.8
              n.scale = 0.9
              n.state = 'tool_calling'
            }
            break

          case 'callee_show':
            if (isCallee) {
              n.opacity = 1.0
              n.scale = 1.0
              n.state = 'complete'
            } else if (isMainAgent) {
              n.opacity = 0.6
              n.scale = 0.8
              n.state = 'thinking'
            }
            break

          case 'callee_to_caller':
            if (isCallee) {
              n.opacity = 1.0 - seqProgress * 0.9
              n.scale = 1.0 - seqProgress * 0.4
              n.state = 'fading'
            } else if (isMainAgent) {
              n.opacity = 0.7 + seqProgress * 0.2
              n.scale = 0.8 + seqProgress * 0.1
              n.state = 'tool_calling'
            }
            break

          case 'callee_fadeout':
            if (isCallee) {
              n.opacity = Math.max(0, 0.85 - seqProgress * 0.85)
              n.scale = Math.max(0.55, 0.95 - seqProgress * 0.4)
              n.state = 'fading'
            } else if (isMainAgent) {
              n.opacity = 0.55
              n.scale = 0.7
              n.state = 'idle'
            }
            break
        }
      } else if (isMainAgent) {
        // Main agent always more visible
        const fi = Math.min(0.5, (currentTime - n.spawnTime) / TIMING.nodeFadeIn * 0.5)
        n.opacity = 0.45 + fi
        n.scale = 0.7 + fi * 0.1
        n.state = 'idle'
      }

      // Update pulse
      if (isInActiveSeq && !isCallee) {
        n.pulseTime = currentTime
      } else if (isCallee && activeSeq?.phase === 'caller_to_callee') {
        n.pulseTime = currentTime
      }
    }
  }, [])

  // ─── Update particles ────────────────────────────────────────────────────────

  const updateParticles = useCallback((currentTime: number) => {
    const alive: ActiveParticle[] = []

    for (const p of activeParticlesRef.current) {
      const prog = (currentTime - p.birthTime) / TIMING.particleLifetime
      if (prog >= 1) continue
      p.progress = Math.max(0, prog)
      alive.push(p)
    }

    activeParticlesRef.current = alive
  }, [])

  // ─── Animation tick ──────────────────────────────────────────────────────────

  const animationTick = useCallback((timestamp: number, deltaTime: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp
    const dt = Math.min(deltaTime, 0.1)
    lastTimeRef.current = timestamp

    if (stateRef.current.isPlaying) {
      currentTimeRef.current += dt * stateRef.current.speed

      const t = currentTimeRef.current
      const totalDuration = stateRef.current.eventQueue.length * TIMING.eventSpacing

      if (t >= totalDuration) {
        currentTimeRef.current = totalDuration
        updateStateRef({ isPlaying: false })
      }

      // Process events
      processEvents(t)
      updateCallSequences(t)
      updateNodeStates(t)
      updateParticles(t)

      // Update state
      updateStateRef({
        currentTime: currentTimeRef.current,
        maxTimeReached: Math.max(stateRef.current.maxTimeReached, currentTimeRef.current),
        eventIndex: eventIndexRef.current,
        particles: activeParticlesRef.current.map(p => ({
          id: p.id,
          edgeId: p.edgeId,
          progress: p.progress,
          type: p.type,
          color: p.color,
          size: p.size,
          trailLength: 0.15,
        })),
      })
    }

    return currentTimeRef.current
  }, [processEvents, updateCallSequences, updateNodeStates, updateParticles, updateStateRef])

  // ─── Controls ────────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    lastTimeRef.current = 0
    updateStateRef({ isPlaying: true })
  }, [updateStateRef])

  const pause = useCallback(() => {
    updateStateRef({ isPlaying: false })
  }, [updateStateRef])

  const restart = useCallback(() => {
    eventIndexRef.current = 0
    currentTimeRef.current = 0
    lastTimeRef.current = 0
    activeParticlesRef.current = []
    callSequencesRef.current = []
    particleIdRef.current = 0

    // Reset node states
    for (const [, n] of activeNodesRef.current) {
      n.opacity = 0
      n.scale = 0.55
      n.state = 'idle'
      n.spawnTime = 0
      n.pulseTime = -9999
    }

    updateStateRef({
      isPlaying: true,
      currentTime: 0,
      maxTimeReached: 0,
      eventIndex: 0,
      particles: [],
    })
  }, [updateStateRef])

  const setSpeed = useCallback((speed: number) => {
    updateStateRef({ speed })
  }, [updateStateRef])

  const seek = useCallback((time: number) => {
    currentTimeRef.current = time
    eventIndexRef.current = 0

    // Reset node states
    for (const [, n] of activeNodesRef.current) {
      n.opacity = 0
      n.scale = 0.55
      n.state = 'idle'
      n.spawnTime = 0
      n.pulseTime = -9999
    }

    // Reprocess events up to this time
    processEvents(time)

    updateStateRef({ currentTime: time, eventIndex: eventIndexRef.current })
  }, [processEvents, updateStateRef])

  // ─── Getters for rendering ──────────────────────────────────────────────────

  const getActiveNodes = useCallback((): ActiveNode[] => {
    return [...activeNodesRef.current.values()]
  }, [])

  const getActiveParticles = useCallback((): ActiveParticle[] => {
    return [...activeParticlesRef.current]
  }, [])

  const getCallSequences = useCallback((): CallSequence[] => {
    return [...callSequencesRef.current]
  }, [])

  const getActiveSequence = useCallback((): CallSequence | null => {
    return [...callSequencesRef.current].reverse().find(s => !s.isComplete) || null
  }, [])

  return {
    // State
    state,

    // Initialization
    initializeFromEntries,

    // Animation
    animationTick,

    // Controls
    play,
    pause,
    restart,
    setSpeed,
    seek,

    // Getters for rendering
    getActiveNodes,
    getActiveParticles,
    getCallSequences,
    getActiveSequence,
  }
}

export type UseAgentSimulation = ReturnType<typeof useAgentSimulation>
