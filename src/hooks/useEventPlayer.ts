/**
 * EventPlayer - 基于队列的播放控制 Hook
 *
 * 严格遵循 Spawn Sequence 和 Return Sequence 时序
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { SanitizedEvent, PlaybackState, FlowNode, FlowEdge, GanttEvent, LogEntry } from '../types/agentFlow'

// ─── 位置类型 ─────────────────────────────────────────────────────────────────

interface NodePosition {
  x: number
  y: number
}

// ─── 播放速度配置 ───────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4]  // 1x = 标准速度

// ─── 时间配置 ─────────────────────────────────────────────────────────────────

const TIMING = {
  nodeAppear: 400,      // 节点出现动画 (ms)
  edgeDraw: 300,        // 连线绘制时间 (ms)
  particleFlow: 600,    // 粒子流动时间 (ms)
  resultShow: 2000,     // 结果展示时间 (ms)
  nodeFade: 400,        // 节点淡出时间 (ms)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface EventPlayerState {
  nodes: FlowNode[]
  edges: FlowEdge[]
  playback: PlaybackState
  ganttEvents: GanttEvent[]
  logs: LogEntry[]
  activeNodeId: string | null
  activeEdgeId: string | null
}

export function useEventPlayer(events: SanitizedEvent[]) {
  const [state, setState] = useState<EventPlayerState>({
    nodes: [],
    edges: [],
    playback: {
      isPlaying: false,
      currentTime: 0,
      speed: 1,
      duration: 0,
      playheadPosition: 0,
    },
    ganttEvents: [],
    logs: [],
    activeNodeId: null,
    activeEdgeId: null,
  })

  const stateRef = useRef(state)
  stateRef.current = state

  const timerRef = useRef<number | null>(null)
  const eventQueueRef = useRef<SanitizedEvent[]>([])
  const processedEventsRef = useRef<Set<string>>(new Set())
  const pendingReturnsRef = useRef<Map<string, string>>(new Map()) // tool_call id -> nodeId
  const isPlayingRef = useRef(false)

  // 计算总时长
  const totalDuration = events.length * TIMING.nodeAppear * 3

  // ─── 添加工具节点到画布 ────────────────────────────────────────────────────

  const addToolNode = useCallback((
    event: SanitizedEvent,
    position: NodePosition,
    _parentId: string
  ): FlowNode => {
    const nodeType = event.toolName?.toLowerCase().includes('bash')
      ? 'tool'
      : event.toolName?.toLowerCase().includes('read') || event.toolName?.toLowerCase().includes('write')
        ? 'tool'
        : 'tool'

    return {
      id: event.nodeId,
      type: 'agentNode',
      position,
      data: {
        label: event.toolName ?? 'Tool',
        sublabel: event.toolInput?.slice(0, 30),
        nodeType,
        status: 'running',
        toolName: event.toolName,
        toolInput: event.toolInput,
      },
    }
  }, [])

  // ─── 添加连线 ──────────────────────────────────────────────────────────────

  const addEdge = useCallback((
    sourceId: string,
    targetId: string,
    toolName?: string
  ): FlowEdge => {
    return {
      id: `edge-${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'agentEdge',
      animated: false,
      data: {
        toolName,
        isActive: false,
        particleProgress: 0,
        direction: 'forward',
      },
    }
  }, [])

  // ─── 处理事件 ──────────────────────────────────────────────────────────────

  const processNextEvent = useCallback(() => {
    const currentState = stateRef.current
    if (eventQueueRef.current.length === 0) {
      // 所有事件处理完毕
      setState(prev => ({
        ...prev,
        playback: { ...prev.playback, isPlaying: false },
      }))
      return
    }

    const event = eventQueueRef.current.shift()!
    if (processedEventsRef.current.has(event.id)) {
      processNextEvent()
      return
    }
    processedEventsRef.current.add(event.id)

    const now = Date.now()

    switch (event.type) {
      case 'user_message': {
        // 用户消息 → 创建 Orchestrator 节点
        const orchestratorNode: FlowNode = {
          id: event.nodeId,
          type: 'agentNode',
          position: { x: 250, y: 200 },
          data: {
            label: 'Orchestrator',
            sublabel: 'Main Agent',
            nodeType: 'orchestrator',
            status: 'thinking',
            tokenCount: 0,
          },
        }

        const newLog: LogEntry = {
          id: `log-${now}`,
          timestamp: event.timestamp,
          type: 'user',
          message: 'User message received',
        }

        setState(prev => ({
          ...prev,
          nodes: [...prev.nodes, orchestratorNode],
          logs: [...prev.logs, newLog],
          activeNodeId: orchestratorNode.id,
        }))
        break
      }

      case 'tool_call': {
        // Spawn Sequence: 节点弹射 → 连线建立 → 数据流动 → 状态更新
        const parentNode = currentState.nodes.find(n => n.id === event.parentId)
        if (!parentNode) {
          console.log('[EventPlayer] tool_call skipped - parent not found:', event.parentId, 'available nodes:', currentState.nodes.map(n => n.id))
          break
        }

        // 计算新节点位置 (父节点右侧)
        const newPosition = {
          x: parentNode.position.x + 280,
          y: parentNode.position.y + (Math.random() - 0.5) * 100,
        }

        // 添加节点
        const newNode = addToolNode(event, newPosition, event.parentId!)
        const newEdge = addEdge(event.parentId!, event.nodeId, event.toolName)

        // 记录待返回事件
        pendingReturnsRef.current.set(event.nodeId, event.id)

        // 更新日志
        const newLog: LogEntry = {
          id: `log-${now}`,
          timestamp: event.timestamp,
          type: 'tool_call',
          message: `${event.toolName} called`,
          details: event.toolInput,
        }

        // 如果有上一个活跃的工具节点，让它淡出消失
        const prevActiveNodeId = stateRef.current.activeNodeId
        const prevActiveNode = prevActiveNodeId ? currentState.nodes.find(n => n.id === prevActiveNodeId) : null
        const isPrevToolNode = prevActiveNode?.data.nodeType === 'tool'

        if (isPrevToolNode && prevActiveNodeId) {
          // 设置上一个工具节点为 exiting 状态
          setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
              n.id === prevActiveNodeId
                ? { ...n, data: { ...n.data, status: 'exiting' as const } }
                : n
            ),
          }))

          // 动画结束后移除该节点
          setTimeout(() => {
            setState(prev => ({
              ...prev,
              nodes: prev.nodes.filter(n => n.id !== prevActiveNodeId),
              edges: prev.edges.filter(e => e.source !== prevActiveNodeId && e.target !== prevActiveNodeId),
            }))
          }, TIMING.nodeFade)
        }

        console.log('[EventPlayer] Creating tool node:', newNode.id, newNode.data.label)

        setState(prev => ({
          ...prev,
          nodes: [...prev.nodes, newNode],
          edges: [...prev.edges, newEdge],
          logs: [...prev.logs, newLog],
          activeNodeId: newNode.id,
          activeEdgeId: newEdge.id,
        }))

        // 模拟粒子流动后进入 running 状态
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
              n.id === newNode.id
                ? { ...n, data: { ...n.data, status: 'running' as const } }
                : n
            ),
            activeEdgeId: null,
          }))
        }, TIMING.particleFlow)
        break
      }

      case 'tool_result':
      case 'error': {
        // Return Sequence: 结果反馈 → 浮窗展示 → 状态回流
        const toolNode = currentState.nodes.find(n => n.id === event.nodeId)
        if (!toolNode) break

        const status = event.isError ? 'error' : 'success'

        // 更新节点状态
        setState(prev => ({
          ...prev,
          nodes: prev.nodes.map(n =>
            n.id === event.nodeId
              ? { ...n, data: { ...n.data, status, toolOutput: event.toolOutput, error: event.isError ? event.toolOutput : undefined } }
              : n
          ),
          logs: [...prev.logs, {
            id: `log-${now}`,
            timestamp: event.timestamp,
            type: event.isError ? 'error' : 'tool_result',
            message: event.isError ? `Error: ${event.toolOutput}` : `${event.toolName} completed`,
            details: event.toolOutput,
          }],
        }))

        // 延迟后节点变暗
        setTimeout(() => {
          setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
              n.id === event.nodeId
                ? { ...n, data: { ...n.data, status: 'idle' as const } }
                : n
            ),
            activeNodeId: null,
          }))
        }, TIMING.resultShow)
        break
      }

      case 'agent_thinking_start': {
        // 思考开始 → 创建 Thinking 节点
        const parentNode = currentState.nodes.find(n => n.id === event.parentId)
        if (!parentNode) {
          console.log('[EventPlayer] agent_thinking_start skipped - parent not found:', event.parentId)
          break
        }

        // 计算新节点位置 (父节点上方)
        const newPosition = {
          x: parentNode.position.x + (Math.random() - 0.5) * 50,
          y: parentNode.position.y - 150,
        }

        // 创建 Thinking 节点
        const thinkingNode: FlowNode = {
          id: event.nodeId,
          type: 'agentNode',
          position: newPosition,
          data: {
            label: 'Thinking',
            sublabel: 'Claude LLM',
            nodeType: 'thinking',
            status: 'thinking',
            toolInput: event.thinking?.slice(0, 200),
          },
        }

        // 添加边
        const newEdge = addEdge(event.parentId!, event.nodeId)

        // 如果有上一个活跃的 thinking 节点，让它淡出
        const prevActiveNodeId = stateRef.current.activeNodeId
        const prevActiveNode = prevActiveNodeId ? currentState.nodes.find(n => n.id === prevActiveNodeId) : null
        const isPrevThinkingNode = prevActiveNode?.data.nodeType === 'thinking'

        if (isPrevThinkingNode && prevActiveNodeId) {
          // 设置上一个 thinking 节点为 exiting 状态
          setState(prev => ({
            ...prev,
            nodes: prev.nodes.map(n =>
              n.id === prevActiveNodeId
                ? { ...n, data: { ...n.data, status: 'exiting' as const } }
                : n
            ),
          }))

          // 动画结束后移除该节点
          setTimeout(() => {
            setState(prev => ({
              ...prev,
              nodes: prev.nodes.filter(n => n.id !== prevActiveNodeId),
              edges: prev.edges.filter(e => e.source !== prevActiveNodeId && e.target !== prevActiveNodeId),
            }))
          }, TIMING.nodeFade)
        }

        setState(prev => ({
          ...prev,
          nodes: [...prev.nodes, thinkingNode],
          edges: [...prev.edges, newEdge],
          logs: [...prev.logs, {
            id: `log-${now}`,
            timestamp: event.timestamp,
            type: 'thinking',
            message: 'Agent is thinking...',
            details: event.thinking?.slice(0, 200),
          }],
          activeNodeId: thinkingNode.id,
          activeEdgeId: newEdge.id,
        }))
        break
      }
    }

    // 更新播放进度
    const progress = (processedEventsRef.current.size / events.length) * 100
    setState(prev => ({
      ...prev,
      playback: {
        ...prev.playback,
        currentTime: (progress / 100) * totalDuration,
        playheadPosition: progress,
      },
    }))

  }, [events.length, totalDuration, addToolNode, addEdge])

  // ─── 播放控制 ──────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    console.log('[EventPlayer] play called, timerRef:', timerRef.current ? 'set' : 'null', 'queue length:', eventQueueRef.current.length)
    if (timerRef.current) {
      console.log('[EventPlayer] play aborted - timer already set')
      return
    }

    // 如果队列为空，重新初始化
    if (eventQueueRef.current.length === 0) {
      console.log('[EventPlayer] initializing queue with', events.length, 'events')
      eventQueueRef.current = [...events]
      processedEventsRef.current.clear()
      pendingReturnsRef.current.clear()
    }

    // Set playing flag before starting
    isPlayingRef.current = true

    setState(prev => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: true },
    }))

    const tick = () => {
      if (!isPlayingRef.current) {
        console.log('[EventPlayer] tick aborted - not playing')
        return
      }

      processNextEvent()

      // 根据速度调整间隔
      const interval = 800 / stateRef.current.playback.speed
      timerRef.current = window.setTimeout(tick, interval)
    }

    tick()
  }, [events, processNextEvent])

  const pause = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    isPlayingRef.current = false
    setState(prev => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: false },
    }))
  }, [])

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    eventQueueRef.current = [...events]
    processedEventsRef.current.clear()
    pendingReturnsRef.current.clear()

    setState(prev => ({
      ...prev,
      nodes: [],
      edges: [],
      logs: [],
      activeNodeId: null,
      activeEdgeId: null,
      playback: {
        ...prev.playback,
        isPlaying: false,
        currentTime: 0,
        playheadPosition: 0,
      },
    }))
  }, [events])

  const setSpeed = useCallback((speed: number) => {
    setState(prev => ({
      ...prev,
      playback: { ...prev.playback, speed },
    }))
  }, [])

  // 初始化
  useEffect(() => {
    eventQueueRef.current = [...events]
  }, [events])

  // 清理
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    ...state,
    play,
    pause,
    reset,
    setSpeed,
    speedOptions: SPEED_OPTIONS,
    totalDuration,
  }
}
