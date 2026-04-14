/**
 * Particle drawing with comet trails.
 */

import type { Agent, ToolCallNode, Particle, Edge } from '../simulation/types'
import { BEAM, FX, PARTICLE_DRAW } from '../lib/canvas-constants'
import { COLORS } from '../lib/colors'
import { bezierPoint, computeControlPoints } from './drawEdges'

function alphaHex(alpha: number): string {
  return Math.floor(alpha * 255).toString(16).padStart(2, '0')
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  edgeMap: Map<string, Edge>,
  agents: Map<string, Agent>,
  _toolCalls: Map<string, ToolCallNode>,
  time: number,
) {
  for (const particle of particles) {
    const edge = edgeMap.get(particle.edgeId)
    if (!edge) continue

    const fromAgent = agents.get(edge.from)
    if (!fromAgent) continue

    const toAgent = agents.get(edge.to)
    if (!toAgent) continue

    const cp = computeControlPoints(fromAgent.x, fromAgent.y, toAgent.x, toAgent.y)
    if (!cp) continue
    const { cp1x, cp1y, cp2x, cp2y, dx, dy, dist } = cp

    const t = particle.progress

    // Wobble effect
    const tangentX = dx / dist
    const tangentY = dy / dist
    const normalX = -tangentY
    const normalY = tangentX
    const phase = (particle.id.charCodeAt(5) || 0) * 0.7
    const wobbleAmt = Math.sin(t * BEAM.wobble.freq + time * BEAM.wobble.timeFreq + phase) * BEAM.wobble.amp * Math.sin(t * Math.PI)

    const baseX = bezierPoint(t, fromAgent.x, cp1x, cp2x, toAgent.x)
    const baseY = bezierPoint(t, fromAgent.y, cp1y, cp2y, toAgent.y)
    const px = baseX + normalX * wobbleAmt
    const py = baseY + normalY * wobbleAmt

    ctx.save()

    // Comet trail
    const isReturn = particle.type === 'return' || particle.type === 'tool_return'
    for (let i = FX.trailSegments; i >= 0; i--) {
      const offset = (i / FX.trailSegments) * BEAM.wobble.trailOffset
      const tt = isReturn
        ? Math.min(1, t + offset)
        : Math.max(0, t - offset)
      const wob = Math.sin(tt * BEAM.wobble.freq + time * BEAM.wobble.timeFreq + phase) * BEAM.wobble.amp * Math.sin(tt * Math.PI)
      const tx = bezierPoint(tt, fromAgent.x, cp1x, cp2x, toAgent.x) + normalX * wob
      const ty = bezierPoint(tt, fromAgent.y, cp1y, cp2y, toAgent.y) + normalY * wob
      const alpha = ((FX.trailSegments - i) / FX.trailSegments) * 0.6
      ctx.beginPath()
      ctx.fillStyle = particle.color + alphaHex(alpha)
      ctx.arc(tx, ty, particle.size * ((FX.trailSegments - i) / FX.trailSegments), 0, Math.PI * 2)
      ctx.fill()
    }

    // Glow effect
    const glowGradient = ctx.createRadialGradient(px, py, 0, px, py, PARTICLE_DRAW.glowRadius)
    glowGradient.addColorStop(0, particle.color + '60')
    glowGradient.addColorStop(1, particle.color + '00')
    ctx.beginPath()
    ctx.fillStyle = glowGradient
    ctx.arc(px, py, PARTICLE_DRAW.glowRadius, 0, Math.PI * 2)
    ctx.fill()

    // Particle core
    ctx.beginPath()
    ctx.fillStyle = particle.color
    ctx.arc(px, py, particle.size, 0, Math.PI * 2)
    ctx.fill()

    // Hot center
    ctx.beginPath()
    ctx.fillStyle = COLORS.holoHot + '80'
    ctx.arc(px, py, particle.size * PARTICLE_DRAW.coreHighlightScale, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

export function getActiveEdgeIds(particles: Particle[]): Set<string> {
  const ids = new Set<string>()
  for (const p of particles) ids.add(p.edgeId)
  return ids
}

export function buildEdgeMap(edges: Edge[]): Map<string, Edge> {
  const map = new Map<string, Edge>()
  for (const e of edges) map.set(e.id, e)
  return map
}
