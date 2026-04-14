/**
 * CustomEdge - Agent 边组件
 *
 * 特性:
 * - 平滑贝塞尔曲线
 * - 粒子流动动画 (SVG animateMotion)
 * - 动态发光效果
 */

import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { motion, AnimatePresence } from 'framer-motion'
import type { AgentEdgeData } from '../../types/agentFlow'

// ─── 颜色配置 ─────────────────────────────────────────────────────────────────

const EDGE_COLORS = {
  default: '#00f0ff',
  tool: '#ff8c00',
  error: '#ff4444',
  success: '#00ff88',
}

function getEdgeColor(toolName?: string, isError?: boolean): string {
  if (isError) return EDGE_COLORS.error
  if (toolName) return EDGE_COLORS.tool
  return EDGE_COLORS.default
}

// ─── 主边组件 ─────────────────────────────────────────────────────────────────

function AgentEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const edgeData = data as AgentEdgeData | undefined
  const color = getEdgeColor(edgeData?.toolName, false)
  const isActive = edgeData?.isActive ?? false

  // 计算贝塞尔路径
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  })

  return (
    <>
      {/* 基础贝塞尔曲线 */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isActive ? color : `${color}40`,
          strokeWidth: isActive ? 3 : 2,
          filter: isActive ? `drop-shadow(0 0 8px ${color})` : 'none',
          transition: 'stroke 0.3s, stroke-width 0.3s',
        }}
      />

      {/* 发光层 (活跃时) */}
      {isActive && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: 8,
            filter: `blur(4px) drop-shadow(0 0 10px ${color})`,
            opacity: 0.5,
          }}
        />
      )}

      {/* 粒子动画 (活跃时) */}
      <AnimatePresence>
        {isActive && (
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 粒子光点 */}
            <motion.circle
              r="5"
              fill={color}
              style={{
                filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`,
              }}
            >
              {/* 沿路径移动动画 */}
              <animateMotion
                dur="0.8s"
                repeatCount="indefinite"
                path={edgePath}
              />
            </motion.circle>

            {/* 粒子尾迹 */}
            <motion.circle
              r="3"
              fill={color}
              opacity="0.6"
            >
              <animateMotion
                dur="0.8s"
                repeatCount="indefinite"
                begin="-0.15s"
                path={edgePath}
              />
            </motion.circle>

            <motion.circle
              r="2"
              fill={color}
              opacity="0.3"
            >
              <animateMotion
                dur="0.8s"
                repeatCount="indefinite"
                begin="-0.3s"
                path={edgePath}
              />
            </motion.circle>
          </motion.g>
        )}
      </AnimatePresence>

      {/* 标签 */}
      {edgeData?.toolName && (
        <EdgeLabelRenderer>
          <motion.div
            className="absolute px-2 py-1 rounded text-[10px] font-mono font-bold pointer-events-all"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: 'rgba(0, 0, 0, 0.8)',
              color: color,
              border: `1px solid ${color}50`,
              backdropFilter: 'blur(4px)',
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            {edgeData.toolName}
          </motion.div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const AgentEdge = memo(AgentEdgeComponent)

// ─── 边类型注册 ────────────────────────────────────────────────────────────────

export const edgeTypes = {
  agentEdge: AgentEdge,
}
