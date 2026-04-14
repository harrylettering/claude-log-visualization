/**
 * GanttChart - 底部执行时间轴 (Gantt Chart)
 *
 * 150px 高度，显示所有节点的执行时间线
 * Playhead 与画布节点状态严格同步
 */

import { motion } from 'framer-motion'
import type { GanttEvent, PlaybackState } from '../../types/agentFlow'

interface GanttChartProps {
  events: GanttEvent[]
  playback: PlaybackState
  width?: number
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#4a5568',
  thinking: '#00f0ff',
  running: '#ff8c00',
  success: '#00ff88',
  error: '#ff4444',
}

export function GanttChart({ events, playback, width: _width = 800 }: GanttChartProps) {
  if (events.length === 0) {
    return (
      <div className="h-[150px] bg-slate-950/50 border-t border-slate-800 flex items-center justify-center">
        <span className="text-slate-500 text-sm">等待事件...</span>
      </div>
    )
  }

  // 计算时间范围
  const minTime = Math.min(...events.map(e => e.startTime))
  const maxTime = Math.max(...events.map(e => e.endTime))
  const duration = maxTime - minTime || 1

  // 计算时间刻度
  const tickCount = Math.min(10, Math.ceil(duration / 1000))
  const tickInterval = duration / tickCount

  return (
    <div className="h-[150px] bg-slate-950/80 border-t border-slate-800 flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-2 border-b border-slate-800/50 flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
          Execution Timeline
        </span>
        <span className="text-[10px] text-slate-500 font-mono">
          {events.length} events
        </span>
      </div>

      {/* 时间轴内容 */}
      <div className="flex-1 overflow-hidden relative">
        {/* 时间刻度 */}
        <div className="absolute inset-x-0 top-0 h-6 flex items-end border-b border-slate-800/30 px-4">
          {Array.from({ length: tickCount + 1 }).map((_, i) => {
            const time = minTime + i * tickInterval
            const x = ((time - minTime) / duration) * 100
            return (
              <div
                key={i}
                className="absolute text-[9px] text-slate-500 font-mono"
                style={{ left: `${x}%`, transform: 'translateX(-50%)' }}
              >
                {Math.round(time / 1000)}s
              </div>
            )
          })}
        </div>

        {/* Gantt 条 */}
        <div className="absolute inset-x-0 top-8 bottom-4 px-4 space-y-1">
          {events.map((event, index) => {
            const startX = ((event.startTime - minTime) / duration) * 100
            const widthPct = ((event.endTime - event.startTime) / duration) * 100
            const color = STATUS_COLORS[event.status] || STATUS_COLORS.idle

            return (
              <div
                key={event.id}
                className="relative h-6 flex items-center"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* 标签 */}
                <div className="w-24 flex-shrink-0 text-[10px] text-slate-400 truncate pr-2">
                  {event.label}
                </div>

                {/* 条形图 */}
                <div className="flex-1 relative h-full">
                  <motion.div
                    className="absolute h-4 top-1 rounded-full"
                    style={{
                      left: `${startX}%`,
                      width: `${Math.max(widthPct, 2)}%`,
                      background: `linear-gradient(90deg, ${color}80, ${color})`,
                      boxShadow: `0 0 8px ${color}60`,
                    }}
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: `${Math.max(widthPct, 2)}%`, opacity: 1 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                  />

                  {/* 状态点 */}
                  {event.status !== 'idle' && (
                    <motion.div
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        left: `${startX}%`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: color,
                        boxShadow: `0 0 6px ${color}`,
                      }}
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.8, 1, 0.8],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Playhead */}
        <motion.div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 pointer-events-none"
          style={{ left: `${playback.playheadPosition}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {/* Playhead 三角形指示器 */}
          <div
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '8px solid #00f0ff',
            }}
          />
        </motion.div>
      </div>
    </div>
  )
}
