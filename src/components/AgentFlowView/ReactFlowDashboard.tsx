/**
 * ReactFlowDashboard - Agent Flow 可视化仪表盘
 *
 * 使用 React Flow + Framer Motion 实现丝滑物理动效
 * 布局: 中央画布 (70%) + 右侧日志 (30%) + 底部时间轴 (150px)
 */

import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw } from 'lucide-react'

import { sanitizeLog } from '../../utils/LogSanitizer'
import { useEventPlayer } from '../../hooks/useEventPlayer'
import { AgentNode } from './CustomNode'
import { edgeTypes } from './CustomEdge'
import { FloatingPanel } from './FloatingPanel'
import { ActivityLog } from './ActivityLog'
import { GanttChart } from './GanttChart'
import type { FlowNode } from '../../types/agentFlow'
import type { ParsedLogData } from '../../types/log'

// ─── 节点类型注册 ──────────────────────────────────────────────────────────────

const nodeTypes = {
  agentNode: AgentNode,
}

// ─── 初始 Orchestrator 节点 ────────────────────────────────────────────────────

function createOrchestratorNode(): FlowNode {
  return {
    id: 'orchestrator-0',
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
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

interface ReactFlowDashboardProps {
  data: ParsedLogData | null
}

export function ReactFlowDashboard({ data }: ReactFlowDashboardProps) {
  // 数据清洗
  const sanitizedEvents = useMemo(() => {
    if (!data) return []
    return sanitizeLog(data)
  }, [data])

  // 事件播放器
  const {
    nodes,
    edges,
    playback,
    ganttEvents,
    logs,
    play,
    pause,
    reset,
    setSpeed,
    speedOptions,
  } = useEventPlayer(sanitizedEvents)

  // 自动开始播放当数据加载时
  const hasStartedRef = useRef(false)
  useEffect(() => {
    if (data && sanitizedEvents.length > 0 && !hasStartedRef.current) {
      hasStartedRef.current = true
      // 延迟一点让节点先渲染
      setTimeout(() => {
        console.log('[ReactFlowDashboard] Starting playback with', sanitizedEvents.length, 'events')
        play()
      }, 500)
    }
  }, [data, sanitizedEvents, play])

  // 浮动面板状态
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null)
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })

  // 初始化节点 (Orchestrator)
  const initialNodes = useMemo(() => {
    if (nodes.length > 0) return nodes
    return [createOrchestratorNode()]
  }, [nodes.length])

  // 转换节点格式给 React Flow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flowNodes = initialNodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
  })) as any[]

  // 转换边格式给 React Flow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flowEdges = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: e.type,
    animated: e.animated,
    data: e.data,
  })) as any[]

  // 节点点击处理
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNodeClick = useCallback((event: React.MouseEvent, node: any) => {
    setSelectedNode(node as FlowNode)
    setPanelPosition({ x: event.clientX, y: event.clientY })
  }, [])

  // 关闭浮窗
  const closePanel = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // 空状态
  if (!data) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0a0a0c]">
        <div className="text-center text-slate-500">
          <Play className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-bold">No log data available</p>
          <p className="text-sm mt-2">Select a session to view the agent flow</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* 主画布区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 中央画布 (70%) */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.5}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'agentEdge',
              animated: false,
            }}
            style={{ background: '#0a0a0c' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#1a1a2e"
            />
            <Controls
              showZoom={false}
              showFitView={false}
              showInteractive={false}
            />
          </ReactFlow>

          {/* 控制栏覆盖层 */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
            {/* 播放控制 */}
            <motion.div
              className="flex items-center gap-3 px-4 py-2 rounded-2xl border border-slate-800/50 bg-black/60 backdrop-blur-md pointer-events-auto"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              {/* 重置按钮 */}
              <button
                onClick={reset}
                className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all"
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* 播放/暂停按钮 */}
              <motion.button
                onClick={playback.isPlaying ? pause : play}
                className="p-3 rounded-xl flex items-center justify-center transition-all"
                style={{
                  background: playback.isPlaying ? '#f59e0b' : '#00f0ff',
                  boxShadow: playback.isPlaying
                    ? '0 0 20px rgba(245, 158, 11, 0.5)'
                    : '0 0 20px rgba(0, 240, 255, 0.5)',
                }}
                whileTap={{ scale: 0.95 }}
              >
                {playback.isPlaying ? (
                  <Pause className="w-5 h-5 text-black" />
                ) : (
                  <Play className="w-5 h-5 text-black" />
                )}
              </motion.button>

              {/* 进度条 */}
              <div className="w-48 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${playback.playheadPosition}%`,
                    background: 'linear-gradient(90deg, #00f0ff, #3b82f6)',
                    boxShadow: '0 0 12px rgba(0, 240, 255, 0.5)',
                  }}
                />
              </div>

              {/* 时间显示 */}
              <span className="text-[10px] text-slate-500 font-mono">
                {playback.currentTime.toFixed(1)}s
              </span>

              {/* 速度选择 */}
              <div className="flex items-center gap-1 ml-2">
                <span className="text-[9px] text-slate-500 uppercase mr-1">Speed</span>
                {speedOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                      playback.speed === s
                        ? 'bg-cyan-500/30 text-cyan-400 border border-cyan-500/50'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:bg-slate-700'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </motion.div>

            {/* 统计信息 */}
            <motion.div
              className="flex items-center gap-4 px-4 py-2 rounded-2xl border border-slate-800/50 bg-black/60 backdrop-blur-md pointer-events-auto"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                <span className="text-[10px] text-slate-400">
                  <span className="font-bold text-white">{nodes.length}</span> nodes
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-slate-400">
                  <span className="font-bold text-white">{edges.length}</span> edges
                </span>
              </div>
            </motion.div>
          </div>

          {/* 浮动面板 */}
          <AnimatePresence>
            {selectedNode && (
              <FloatingPanel
                node={selectedNode}
                onClose={closePanel}
                position={panelPosition}
              />
            )}
          </AnimatePresence>
        </div>

        {/* 右侧日志区域 (30%) */}
        <div className="w-[30%] min-w-[300px] max-w-[400px]">
          <ActivityLog logs={logs} />
        </div>
      </div>

      {/* 底部时间轴 */}
      <GanttChart
        events={ganttEvents}
        playback={playback}
        width={1200}
      />
    </div>
  )
}
