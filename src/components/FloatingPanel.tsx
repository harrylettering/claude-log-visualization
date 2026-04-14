import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FlowNode } from '../types/flow'
import {
  X,
  Terminal,
  FileCode2,
  BookOpen,
  Zap,
  GitBranch,
  ExternalLink,
  ChevronRight,
  Clock,
  Hash,
} from 'lucide-react'

// ─── Panel Config by Node Type ────────────────────────────────────────────────

function getPanelConfig(node: FlowNode) {
  if (node.type === 'tool-bash') {
    return {
      icon: Terminal,
      color: '#4ade80',
      bg: '#021a0e',
      title: 'Terminal Command',
      badge: 'Bash',
    }
  }
  if (node.type === 'tool-file') {
    return {
      icon: FileCode2,
      color: '#fbbf24',
      bg: '#150e02',
      title: 'File Operation',
      badge: 'File',
    }
  }
  if (node.type === 'tool-network') {
    return {
      icon: ExternalLink,
      color: '#22d3ee',
      bg: '#031926',
      title: 'Network Request',
      badge: 'Network',
    }
  }
  if (node.type === 'tool-mcp') {
    return {
      icon: Zap,
      color: '#f472b6',
      bg: '#200a1a',
      title: 'MCP Tool Call',
      badge: 'MCP',
    }
  }
  if (node.type === 'tool-task') {
    return {
      icon: GitBranch,
      color: '#fb923c',
      bg: '#160800',
      title: 'Task/Agent',
      badge: 'Task',
    }
  }
  if (node.type === 'llm') {
    return {
      icon: BookOpen,
      color: '#38bdf8',
      bg: '#071922',
      title: 'LLM Response',
      badge: node.sublabel ?? 'LLM',
    }
  }
  return {
    icon: Hash,
    color: '#94a3b8',
    bg: '#0a0f1c',
    title: node.label,
    badge: 'Tool',
  }
}

// ─── Tool Result Preview ─────────────────────────────────────────────────────

function ToolResultPreview({ node }: { node: FlowNode }) {
  const content = node.content ?? ''
  const lines = content.split('\n').slice(0, 8)
  const truncated = lines.join('\n')
  const hasMore = content.split('\n').length > 8

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
          Preview
        </span>
        {hasMore && (
          <span className="text-[8px] text-slate-600">
            +{content.split('\n').length - 8} more lines
          </span>
        )}
      </div>
      <pre
        className="text-[10px] font-mono text-slate-300 bg-black/40 rounded-lg p-3 overflow-x-auto leading-relaxed border border-slate-800/50"
        style={{ maxHeight: 120 }}
      >
        {truncated || '(No output)'}
      </pre>
    </div>
  )
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ node }: { node: FlowNode }) {
  const items = [
    { label: 'Calls', value: node.callCount, show: node.callCount > 0 },
    { label: 'Errors', value: node.errorCount, show: node.errorCount > 0, error: true },
    { label: 'Cost', value: `$${(node.cost ?? 0).toFixed(4)}`, show: (node.cost ?? 0) > 0 },
    { label: 'In', value: `${((node.inputTokens ?? 0) / 1000).toFixed(1)}k`, show: (node.inputTokens ?? 0) > 0 },
    { label: 'Out', value: `${((node.outputTokens ?? 0) / 1000).toFixed(1)}k`, show: (node.outputTokens ?? 0) > 0 },
  ]

  return (
    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800/50">
      {items.filter(i => i.show).map(item => (
        <div key={item.label} className="flex items-center gap-1">
          <span className="text-[8px] text-slate-500 uppercase tracking-wider">{item.label}</span>
          <span
            className="text-[10px] font-bold font-mono"
            style={{ color: item.error ? '#ef4444' : '#e2e8f0' }}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main Floating Panel Component ────────────────────────────────────────────

interface FloatingPanelProps {
  node: FlowNode | null
  position: { x: number; y: number }
  onClose: () => void
}

export function FloatingPanel({ node, position, onClose }: FloatingPanelProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Don't auto-close while hovering
  useEffect(() => {
    if (isHovered) return
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [isHovered, onClose])

  if (!node) return null

  const config = getPanelConfig(node)
  const Icon = config.icon

  return (
    <AnimatePresence>
      <motion.div
        key={node.id}
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -5 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 25,
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="absolute z-50 w-72 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md"
        style={{
          left: position.x + 20,
          top: position.y,
          background: `${config.bg}f5`,
          border: `1px solid ${config.color}40`,
          boxShadow: `0 0 40px ${config.color}20, 0 20px 40px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Glow effect at top */}
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, transparent, ${config.color}, transparent)`,
          }}
        />

        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: `${config.color}10` }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${config.color}25` }}
            >
              <Icon className="w-4 h-4" style={{ color: config.color }} />
            </div>
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-widest"
                style={{ color: config.color }}
              >
                {config.title}
              </div>
              <div className="text-[9px] text-slate-500 font-mono">
                {node.label}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-700/50 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Tool call details */}
          {node.content && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ChevronRight className="w-3 h-3 text-slate-500" />
                <span className="text-[9px] text-slate-400 font-mono truncate">
                  {node.content}
                </span>
              </div>
            </div>
          )}

          {/* LLM response preview */}
          {(node.thinking || node.responseText) && (
            <div className="mt-2 p-3 rounded-lg bg-black/30 border border-slate-800/50">
              <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1">
                {node.thinking ? 'Thinking' : 'Response'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono leading-relaxed">
                {(node.thinking ?? node.responseText ?? '').slice(0, 150)}
                {(node.thinking ?? node.responseText ?? '').length > 150 && '...'}
              </div>
            </div>
          )}

          {/* Tool result preview */}
          {node.type.startsWith('tool-') && node.content && (
            <ToolResultPreview node={node} />
          )}

          {/* Stats */}
          <StatsRow node={node} />

          {/* Context percentage bar */}
          {node.contextPct !== undefined && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-slate-500 uppercase tracking-wider">
                  Context Usage
                </span>
                <span className="text-[9px] font-mono text-slate-400">
                  {node.contextPct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, node.contextPct)}%`,
                    background: `linear-gradient(90deg, ${config.color}60, ${config.color})`,
                    boxShadow: `0 0 8px ${config.color}40`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer with timestamp */}
        <div className="px-4 py-2 bg-black/30 flex items-center justify-between border-t border-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="text-[8px] text-slate-500 font-mono">
                {new Date().toLocaleTimeString()}
              </span>
            </div>
            {node.model && (
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-slate-600">via</span>
                <span className="text-[8px] text-slate-400 font-mono">{node.model.slice(0, 12)}</span>
              </div>
            )}
          </div>
          <div
            className="px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-wider"
            style={{ background: `${config.color}20`, color: config.color }}
          >
            {config.badge}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─── Staggered Panel Animation Demo ──────────────────────────────────────────

interface StaggeredPanelProps {
  panels: Array<{ id: string; node: FlowNode; position: { x: number; y: number } }>
  onClose: (id: string) => void
}

export function StaggeredPanels({ panels, onClose }: StaggeredPanelProps) {
  return (
    <AnimatePresence>
      {panels.map((panel, index) => (
        <motion.div
          key={panel.id}
          initial={{ opacity: 0, x: -20, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -20, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 250,
            damping: 20,
            delay: index * 0.05,
          }}
        >
          <FloatingPanel
            node={panel.node}
            position={panel.position}
            onClose={() => onClose(panel.id)}
          />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
