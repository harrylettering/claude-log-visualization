/**
 * Agent node drawing with holographic effects.
 */

import type { Agent, VisualEffect } from '../simulation/types'
import { COLORS, getStateColor } from '../lib/colors'
import { AGENT_DRAW, CONTEXT_RING, ANIM } from '../lib/canvas-constants'

export function drawAgents(
  ctx: CanvasRenderingContext2D,
  agents: Map<string, Agent>,
  selectedAgentId: string | null,
  hoveredAgentId: string | null,
  time: number,
) {
  for (const [id, agent] of agents) {
    if (agent.opacity < 0.05) continue

    ctx.save()
    ctx.globalAlpha = agent.opacity
    ctx.translate(agent.x, agent.y)
    ctx.scale(agent.scale, agent.scale)

    const isSelected = id === selectedAgentId
    const isHovered = id === hoveredAgentId
    const radius = agent.isMain ? AGENT_DRAW.radiusMain : AGENT_DRAW.radiusSub
    const stateColor = getStateColor(agent.state)

    // Outer glow
    const breathe = agent.state === 'thinking'
      ? Math.sin(time * ANIM.breathe.thinkingSpeed) * ANIM.breathe.thinkingAmp
      : Math.sin(time * ANIM.breathe.idleSpeed) * ANIM.breathe.idleAmp

    const glowRadius = radius + AGENT_DRAW.glowPadding + (breathe * radius)

    // Glow gradient
    const glowGradient = ctx.createRadialGradient(0, 0, radius, 0, 0, glowRadius)
    glowGradient.addColorStop(0, stateColor + '40')
    glowGradient.addColorStop(1, stateColor + '00')
    ctx.beginPath()
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = glowGradient
    ctx.fill()

    // Hexagon clip path for agent
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()

    // Fill
    ctx.fillStyle = COLORS.cardBg
    ctx.fill()

    // Border with state color
    ctx.strokeStyle = stateColor + (isSelected ? 'ff' : isHovered ? 'cc' : '80')
    ctx.lineWidth = isSelected ? 2 : 1.5
    ctx.stroke()

    // Outer ring for thinking state
    if (agent.state === 'thinking') {
      ctx.save()
      ctx.beginPath()
      ctx.arc(0, 0, radius + AGENT_DRAW.outerRingOffset, 0, Math.PI * 2)
      ctx.strokeStyle = stateColor + '40'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.lineDashOffset = -time * 20
      ctx.stroke()
      ctx.restore()
    }

    // Context ring (token usage)
    const contextPct = agent.tokensUsed / agent.tokensMax
    if (contextPct > 0) {
      ctx.beginPath()
      ctx.arc(0, 0, radius + CONTEXT_RING.ringOffset, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(contextPct, 1))
      ctx.strokeStyle = contextPct > CONTEXT_RING.criticalThreshold
        ? COLORS.error
        : contextPct > CONTEXT_RING.warningThreshold
          ? COLORS.tool_calling
          : stateColor
      ctx.lineWidth = CONTEXT_RING.ringWidth
      ctx.stroke()
    }

    // Agent name
    ctx.fillStyle = COLORS.textPrimary
    ctx.font = `bold ${agent.isMain ? 11 : 9}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(agent.name, 0, radius + AGENT_DRAW.labelYOffset)

    // State indicator
    if (agent.state === 'tool_calling' && agent.currentTool) {
      ctx.fillStyle = COLORS.tool_calling
      ctx.font = `7px system-ui, sans-serif`
      ctx.fillText(agent.currentTool, 0, 0)
    }

    // Token counter for main agent
    if (agent.isMain) {
      const tokensDisplay = agent.tokensUsed > 1000
        ? `${Math.round(agent.tokensUsed / 1000)}k`
        : `${Math.round(agent.tokensUsed)}`

      ctx.fillStyle = COLORS.costText
      ctx.font = `8px monospace`
      ctx.fillText(`${tokensDisplay} / ${Math.round(agent.tokensMax / 1000)}k`, 0, -radius - 8)
    }

    ctx.restore()
  }
}

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  effects: VisualEffect[],
) {
  for (const effect of effects) {
    const progress = effect.age / effect.duration

    ctx.save()
    ctx.translate(effect.x, effect.y)

    if (effect.type === 'spawn') {
      // Spawn ring effect
      const ringRadius = 10 + progress * 60
      const alpha = (1 - progress) * 0.7

      ctx.beginPath()
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.holoBase + Math.floor(alpha * 255).toString(16).padStart(2, '0')
      ctx.lineWidth = 3 * (1 - progress)
      ctx.stroke()

      // Flash
      if (progress < 0.3) {
        const flashAlpha = (1 - progress / 0.3) * 0.6
        ctx.beginPath()
        ctx.arc(0, 0, 20, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.holoBase + Math.floor(flashAlpha * 255).toString(16).padStart(2, '0')
        ctx.fill()
      }
    } else if (effect.type === 'complete') {
      // Complete ring effect
      const ringRadius = 20 + progress * 80
      const alpha = (1 - progress) * 0.6

      ctx.beginPath()
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.complete + Math.floor(alpha * 255).toString(16).padStart(2, '0')
      ctx.lineWidth = 3 * (1 - progress)
      ctx.stroke()

      // Checkmark flash
      if (progress < 0.2) {
        const flashAlpha = (1 - progress / 0.2) * 0.8
        ctx.beginPath()
        ctx.arc(0, 0, 30, 0, Math.PI * 2)
        ctx.fillStyle = COLORS.complete + Math.floor(flashAlpha * 255).toString(16).padStart(2, '0')
        ctx.fill()
      }
    }

    ctx.restore()
  }
}
