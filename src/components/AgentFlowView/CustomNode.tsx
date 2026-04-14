/**
 * CustomNode - Agent 节点组件
 *
 * 特性:
 * - 弹簧弹出动画 (spring animation)
 * - 状态指示器 (thinking spinner, success/error glow)
 * - 毛玻璃浮窗展示详情
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, Terminal, FileText, Globe, Database, Wrench } from 'lucide-react'
import type { AgentNodeData, NodeStatus } from '../../types/agentFlow'

// ─── 图标映射 ─────────────────────────────────────────────────────────────────

const ToolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Bash: Terminal,
  bash: Terminal,
  Run: Terminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Glob: FileText,
  WebFetch: Globe,
  WebSearch: Globe,
  mcp: Database,
  sql: Database,
  database: Database,
  default: Wrench,
}

function getToolIcon(toolName?: string) {
  if (!toolName) return ToolIcons.default
  const icon = ToolIcons[toolName]
  return icon ?? ToolIcons.default
}

// ─── 状态颜色 ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<NodeStatus, { border: string; glow: string; bg: string }> = {
  idle: { border: '#4a5568', glow: 'transparent', bg: '#1a1a2e' },
  thinking: { border: '#00f0ff', glow: '#00f0ff40', bg: '#1a1a2e' },
  running: { border: '#ff8c00', glow: '#ff8c0040', bg: '#1a1a2e' },
  success: { border: '#00ff88', glow: '#00ff8840', bg: '#1a1a2e' },
  error: { border: '#ff4444', glow: '#ff444460', bg: '#2a1a1e' },
  exiting: { border: '#4a5568', glow: 'transparent', bg: '#1a1a2e' },
}

// ─── Orchestrator 节点 ─────────────────────────────────────────────────────────

function OrchestratorNode({ data }: { data: AgentNodeData }) {
  const isThinking = data.status === 'thinking' || data.status === 'running'

  return (
    <motion.div
      className="relative w-32 h-32 flex items-center justify-center"
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 18 }}
    >
      {/* 六边形背景 */}
      <motion.div
        className="absolute inset-0"
        style={{
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          background: `linear-gradient(135deg, ${STATUS_COLORS[data.status].bg} 0%, #0a0a0c 100%)`,
          border: `2px solid ${STATUS_COLORS[data.status].border}`,
          boxShadow: `0 0 20px ${STATUS_COLORS[data.status].glow}, inset 0 0 20px ${STATUS_COLORS[data.status].glow}`,
        }}
        animate={{
          boxShadow: [
            `0 0 20px ${STATUS_COLORS[data.status].glow}, inset 0 0 20px ${STATUS_COLORS[data.status].glow}`,
            `0 0 40px ${STATUS_COLORS[data.status].glow}, inset 0 0 30px ${STATUS_COLORS[data.status].glow}`,
            `0 0 20px ${STATUS_COLORS[data.status].glow}, inset 0 0 20px ${STATUS_COLORS[data.status].glow}`,
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* 旋转虚线圈 (thinking 时) */}
      {isThinking && (
        <motion.div
          className="absolute inset-[-8px] rounded-full border-2 border-dashed border-cyan-400/50"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
        />
      )}

      {/* 内容 */}
      <div className="text-center z-10">
        <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">
          {data.label}
        </div>
        {data.tokenCount !== undefined && (
          <motion.div
            className="text-[20px] font-black text-white"
            key={data.tokenCount}
            initial={{ scale: 1.3, color: '#00f0ff' }}
            animate={{ scale: 1, color: '#ffffff' }}
            transition={{ duration: 0.3 }}
          >
            {data.tokenCount.toLocaleString()}
          </motion.div>
        )}
        <div className="text-[8px] text-slate-500 uppercase tracking-widest">tokens</div>
      </div>

      {/* Token 进度条 */}
      {data.progress !== undefined && (
        <div className="absolute bottom-[-20px] left-0 right-0 h-1 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${data.progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      <Handle type="target" position={Position.Left} className="!bg-cyan-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-cyan-500 !w-2 !h-2" />
    </motion.div>
  )
}

// ─── 工具节点 ─────────────────────────────────────────────────────────────────

function ToolNode({ data, selected }: { data: AgentNodeData; selected?: boolean }) {
  const Icon = getToolIcon(data.toolName)
  const isExiting = data.status === 'exiting'
  // 保持原来的颜色，不因为 exiting 状态改变
  const colors = isExiting ? STATUS_COLORS.running : STATUS_COLORS[data.status]

  return (
    <motion.div
      className="relative"
      initial={{ scale: 0, x: -50, opacity: 1 }}
      animate={{
        scale: isExiting ? 0.8 : 1,
        x: isExiting ? 50 : 0,
        opacity: isExiting ? 0 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 150,
        damping: 18,
        opacity: { duration: 0.3 },
      }}
      whileHover={isExiting ? {} : { scale: 1.05 }}
    >
      {/* 卡片主体 */}
      <div
        className="w-56 p-3 rounded-xl border-2 backdrop-blur-md"
        style={{
          background: colors.bg,
          borderColor: colors.border,
          boxShadow: selected
            ? `0 0 30px ${colors.glow}, 0 0 60px ${colors.glow}`
            : `0 0 15px ${colors.glow}`,
        }}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded-lg"
            style={{ background: `${colors.border}30` }}
          >
            <div style={{ color: colors.border }}>
              <Icon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {data.label}
            </div>
            {data.sublabel && (
              <div className="text-[10px] text-slate-500 truncate">
                {data.sublabel}
              </div>
            )}
          </div>

          {/* 状态图标 */}
          <div className="flex-shrink-0">
            {data.status === 'thinking' || data.status === 'running' ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Loader2 className="w-4 h-4 text-cyan-400" />
              </motion.div>
            ) : data.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : data.status === 'error' ? (
              <XCircle className="w-4 h-4 text-red-400" />
            ) : null}
          </div>
        </div>

        {/* 输入预览 */}
        {data.toolInput && (
          <div className="mt-2 p-2 rounded-lg bg-black/30 border border-slate-700/50">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
              Input
            </div>
            <div className="text-[10px] text-slate-300 font-mono truncate">
              {data.toolInput}
            </div>
          </div>
        )}

        {/* Token 消耗 */}
        {data.tokenCount !== undefined && (
          <div className="mt-2 text-[10px] text-slate-500 text-right">
            {data.tokenCount.toLocaleString()} tokens
          </div>
        )}
      </div>

      {/* 成功/错误闪烁效果 */}
      <AnimatePresence>
        {(data.status === 'success' || data.status === 'error') && (
          <motion.div
            className="absolute inset-0 rounded-xl border-2 pointer-events-none"
            style={{ borderColor: colors.border }}
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 0.3, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, repeat: 2 }}
          />
        )}
      </AnimatePresence>

      <Handle type="target" position={Position.Left} className="!bg-amber-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-amber-500 !w-2 !h-2" />
    </motion.div>
  )
}

// ─── Thinking 节点 (LLM 思考) ─────────────────────────────────────────────────

function ThinkingNode({ data, selected }: { data: AgentNodeData; selected?: boolean }) {
  const isExiting = data.status === 'exiting'

  return (
    <motion.div
      className="relative"
      initial={{ scale: 0, y: -30, opacity: 1 }}
      animate={{
        scale: isExiting ? 0.8 : 1,
        y: isExiting ? -50 : 0,
        opacity: isExiting ? 0 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 150,
        damping: 18,
        opacity: { duration: 0.3 },
      }}
      whileHover={isExiting ? {} : { scale: 1.05 }}
    >
      {/* 卡片主体 - 紫色主题代表 LLM 思考 */}
      <div
        className="w-64 p-3 rounded-xl border-2 backdrop-blur-md"
        style={{
          background: isExiting ? '#1a1a2e' : 'linear-gradient(135deg, #2d1b4e 0%, #1a1a2e 100%)',
          borderColor: isExiting ? '#4a5568' : '#a855f7',
          boxShadow: selected
            ? '0 0 30px #a855f740, 0 0 60px #a855f720'
            : '0 0 15px #a855f720',
        }}
      >
        {/* 头部 */}
        <div className="flex items-center gap-2 mb-2">
          <div
            className="p-1.5 rounded-lg bg-purple-500/20"
          >
            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-purple-300 truncate">
              {data.label || 'Thinking'}
            </div>
            {data.sublabel && (
              <div className="text-[10px] text-slate-500 truncate">
                {data.sublabel}
              </div>
            )}
          </div>
        </div>

        {/* 思考内容预览 */}
        {data.toolInput && (
          <div className="mt-2 p-2 rounded-lg bg-black/30 border border-purple-500/20">
            <div className="text-[9px] text-purple-400 uppercase tracking-wider mb-1">
              Reasoning
            </div>
            <div className="text-[10px] text-slate-300 font-mono max-h-16 overflow-hidden">
              {data.toolInput.slice(0, 150)}...
            </div>
          </div>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!bg-purple-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500 !w-2 !h-2" />
    </motion.div>
  )
}

// ─── 用户节点 ─────────────────────────────────────────────────────────────────

function UserNode() {
  return (
    <motion.div
      className="w-24 p-3 rounded-xl bg-gradient-to-br from-green-900/30 to-green-950/50 border-2 border-green-500/50 backdrop-blur-md"
      initial={{ scale: 0, y: -30 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 18 }}
    >
      <div className="text-center">
        <div className="text-xs font-bold text-green-400 mb-1">USER</div>
        <div className="text-[10px] text-slate-400">Human Input</div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-500 !w-2 !h-2" />
    </motion.div>
  )
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────

function AgentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData

  switch (nodeData.nodeType) {
    case 'orchestrator':
      return <OrchestratorNode data={nodeData} />
    case 'tool':
      return <ToolNode data={nodeData} selected={selected} />
    case 'thinking':
      return <ThinkingNode data={nodeData} selected={selected} />
    case 'user':
      return <UserNode />
    default:
      return <ToolNode data={nodeData} selected={selected} />
  }
}

export const AgentNode = memo(AgentNodeComponent)
