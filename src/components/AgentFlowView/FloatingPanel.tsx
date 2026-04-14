/**
 * FloatingPanel - 毛玻璃浮窗
 *
 * 使用 AnimatePresence 实现弹出/消失动画
 * 展示节点详情、代码 Diff 或输出结果
 */

import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, Terminal, FileText, AlertCircle } from 'lucide-react'
import type { AgentNodeData } from '../../types/agentFlow'

interface FloatingPanelProps {
  node: AgentFlowNode | null
  onClose: () => void
  position: { x: number; y: number }
}

type AgentFlowNode = {
  id: string
  data: AgentNodeData
  position: { x: number; y: number }
}

export function FloatingPanel({ node, onClose, position }: FloatingPanelProps) {
  if (!node) return null

  const data = node.data
  const isError = data.status === 'error'

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          className="fixed z-50"
          style={{
            left: position.x + 20,
            top: position.y - 10,
          }}
          initial={{ opacity: 0, scale: 0.8, x: -20 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8, x: -20 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          {/* 毛玻璃背景 */}
          <div
            className="w-80 rounded-2xl border overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              borderColor: isError ? 'rgba(255, 68, 68, 0.5)' : 'rgba(0, 240, 255, 0.3)',
              boxShadow: isError
                ? '0 0 40px rgba(255, 68, 68, 0.3)'
                : '0 0 40px rgba(0, 240, 255, 0.2)',
            }}
          >
            {/* 头部 */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{
                background: isError
                  ? 'rgba(255, 68, 68, 0.15)'
                  : 'rgba(0, 240, 255, 0.1)',
                borderBottom: `1px solid ${isError ? 'rgba(255, 68, 68, 0.3)' : 'rgba(0, 240, 255, 0.2)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                {isError ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <FileText className="w-4 h-4 text-cyan-400" />
                )}
                <span className="text-xs font-bold text-white">
                  {data.label}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容区 */}
            <div className="p-4 space-y-3">
              {/* 工具名称 */}
              {data.toolName && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                    Tool
                  </div>
                  <div className="text-sm font-mono text-cyan-400">
                    {data.toolName}
                  </div>
                </div>
              )}

              {/* 输入 */}
              {data.toolInput && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" /> Input
                  </div>
                  <div
                    className="p-2 rounded-lg bg-black/40 border border-slate-700/50 font-mono text-[11px] text-slate-300 max-h-24 overflow-y-auto"
                  >
                    {data.toolInput}
                  </div>
                </div>
              )}

              {/* 输出 */}
              {data.toolOutput && (
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <Terminal className="w-3 h-3" /> Output
                  </div>
                  <div
                    className={`p-2 rounded-lg border font-mono text-[11px] max-h-32 overflow-y-auto ${
                      isError
                        ? 'bg-red-950/30 border-red-900/50 text-red-300'
                        : 'bg-black/40 border-slate-700/50 text-slate-300'
                    }`}
                  >
                    {data.toolOutput}
                  </div>
                </div>
              )}

              {/* Token 消耗 */}
              {data.tokenCount !== undefined && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500">Token 消耗</span>
                  <span className="text-sm font-bold text-cyan-400">
                    {data.tokenCount.toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* 底部装饰 */}
            <div
              className="h-1"
              style={{
                background: isError
                  ? 'linear-gradient(90deg, transparent, #ff4444, transparent)'
                  : 'linear-gradient(90deg, transparent, #00f0ff, transparent)',
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
