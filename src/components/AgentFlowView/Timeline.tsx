/**
 * Gantt-style timeline panel.
 */

import { useState, useEffect, useRef } from 'react'
import type { TimelineEntry } from './simulation/types'
import { COLORS } from './lib/colors'
import { TIMELINE } from './lib/canvas-constants'

interface TimelinePanelProps {
  entries: TimelineEntry[]
  currentTime: number
  maxTime: number
  isPlaying: boolean
}

export function TimelinePanel({ entries, currentTime, maxTime, isPlaying }: TimelinePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: TIMELINE.rowHeight + TIMELINE.headerHeight })

  // Update canvas dimensions on resize
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        setDimensions({ width: w, height: TIMELINE.rowHeight + TIMELINE.headerHeight })
      }
    })
    observer.observe(canvas.parentElement!)
    return () => observer.disconnect()
  }, [])

  // Draw timeline
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = dimensions.width
    const h = dimensions.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }

    // Clear
    ctx.fillStyle = COLORS.panelBg
    ctx.fillRect(0, 0, w, h)

    // Header background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.fillRect(0, 0, w, TIMELINE.headerHeight)

    // Time markers
    const timeScale = Math.min(TIMELINE.timeScale, w / (maxTime + 1))
    ctx.fillStyle = COLORS.textDim
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'

    for (let t = 0; t <= maxTime + 1; t++) {
      const x = TIMELINE.headerHeight + t * timeScale
      if (x > w) break

      // Tick mark
      ctx.strokeStyle = COLORS.holoBorder08
      ctx.beginPath()
      ctx.moveTo(x, TIMELINE.headerHeight - 5)
      ctx.lineTo(x, TIMELINE.headerHeight)
      ctx.stroke()

      // Label
      ctx.fillText(`${t}s`, x, TIMELINE.headerHeight - 8)
    }

    // Draw rows
    entries.forEach((entry, rowIndex) => {
      const y = TIMELINE.headerHeight + rowIndex * TIMELINE.rowHeight

      // Row background (alternating)
      if (rowIndex % 2 === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
        ctx.fillRect(0, y, w, TIMELINE.rowHeight)
      }

      // Agent name
      ctx.fillStyle = COLORS.textPrimary
      ctx.font = '9px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(entry.agentName, 8, y + TIMELINE.rowHeight / 2 + 3)

      // Timeline blocks
      entry.blocks.forEach(block => {
        const startX = TIMELINE.headerHeight + block.startTime * timeScale
        const endX = block.endTime
          ? TIMELINE.headerHeight + block.endTime * timeScale
          : TIMELINE.headerHeight + currentTime * timeScale
        const blockWidth = Math.max(2, endX - startX)

        ctx.fillStyle = block.color
        ctx.fillRect(startX, y + 4, blockWidth, TIMELINE.rowHeight - 8)

        // Block label
        if (blockWidth > 30) {
          ctx.fillStyle = '#000'
          ctx.font = '7px system-ui, sans-serif'
          ctx.fillText(block.label, startX + 4, y + TIMELINE.rowHeight / 2 + 2)
        }
      })
    })

    // Current time playhead
    const playheadX = TIMELINE.headerHeight + currentTime * timeScale
    if (playheadX <= w) {
      ctx.strokeStyle = COLORS.holoBase
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, h)
      ctx.stroke()

      // Glow
      const gradient = ctx.createLinearGradient(playheadX - 10, 0, playheadX + 10, 0)
      gradient.addColorStop(0, 'rgba(102, 204, 255, 0)')
      gradient.addColorStop(0.5, 'rgba(102, 204, 255, 0.3)')
      gradient.addColorStop(1, 'rgba(102, 204, 255, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(playheadX - 10, 0, 20, h)
    }
  }, [dimensions, entries, currentTime, maxTime, isPlaying])

  return (
    <div className="w-full border-t border-slate-800/50 bg-slate-900/50">
      <div className="px-4 py-2 border-b border-slate-800/30">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
          Execution Timeline
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: dimensions.height }}
        className="w-full"
      />
    </div>
  )
}
