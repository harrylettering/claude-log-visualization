/**
 * ActivityLog - 流式终端日志
 *
 * 右侧 30% 宽度区域，显示实时的 agent 日志流
 * 包括 tool_call、tool_result、thinking 等
 */

import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Terminal, User, Loader2, CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import type { LogEntry } from '../../types/agentFlow'

interface ActivityLogProps {
  logs: LogEntry[]
}

const LOG_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  user: User,
  tool_call: Terminal,
  tool_result: CheckCircle2,
  thinking: Loader2,
  error: XCircle,
  default: MessageSquare,
}

const LOG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  user: { bg: 'bg-green-900/20', border: 'border-green-500/30', text: 'text-green-400' },
  tool_call: { bg: 'bg-amber-900/20', border: 'border-amber-500/30', text: 'text-amber-400' },
  tool_result: { bg: 'bg-cyan-900/20', border: 'border-cyan-500/30', text: 'text-cyan-400' },
  thinking: { bg: 'bg-purple-900/20', border: 'border-purple-500/30', text: 'text-purple-400' },
  error: { bg: 'bg-red-900/20', border: 'border-red-500/30', text: 'text-red-400' },
}

function LogItem({ log, index }: { log: LogEntry; index: number }) {
  const Icon = LOG_ICONS[log.type] ?? LOG_ICONS.default
  const colors = LOG_COLORS[log.type] ?? LOG_COLORS.tool_call
  const isThinking = log.type === 'thinking'

  return (
    <motion.div
      className="p-3 rounded-xl border backdrop-blur-sm"
      style={{
        background: 'rgba(10, 10, 15, 0.8)',
        borderColor: colors.border,
      }}
      initial={{ opacity: 0, x: 50, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 20,
        delay: index * 0.02,
      }}
    >
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`p-1.5 rounded-lg ${colors.bg}`}
        >
          <Icon
            className={`w-3.5 h-3.5 ${colors.text} ${isThinking ? 'animate-spin' : ''}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
            {log.type.replace('_', ' ')}
          </div>
          <div className="text-[9px] text-slate-500 font-mono">
            {new Date(log.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* 消息 */}
      <div className={`text-xs font-mono ${log.type === 'error' ? 'text-red-300' : 'text-slate-300'}`}>
        {log.message}
      </div>

      {/* 详情 (可折叠) */}
      {log.details && (
        <div className="mt-2 p-2 rounded-lg bg-black/30 border border-slate-800/50">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
            Details
          </div>
          <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
            {log.details}
          </pre>
        </div>
      )}
    </motion.div>
  )
}

export function ActivityLog({ logs }: ActivityLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="h-full flex flex-col bg-slate-950/50 border-l border-slate-800">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
            Activity Log
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-slate-500">Live</span>
        </div>
      </div>

      {/* 日志列表 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {logs.map((log, index) => (
            <LogItem key={log.id} log={log} index={index} />
          ))}
        </AnimatePresence>

        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <Terminal className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm">等待日志...</span>
          </div>
        )}
      </div>
    </div>
  )
}
