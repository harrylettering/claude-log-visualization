/**
 * Background layer drawing with animated dot grid.
 */

import { COLORS } from '../lib/colors'

interface DepthParticle {
  x: number
  y: number
  size: number
  brightness: number
  speed: number
  depth: number
}

export function createDepthParticles(width: number, height: number): DepthParticle[] {
  const particles: DepthParticle[] = []
  const count = Math.floor((width * height) / 8000)

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      brightness: Math.random() * 0.5 + 0.1,
      speed: Math.random() * 0.02 + 0.005,
      depth: Math.random(),
    })
  }
  return particles
}

export function updateDepthParticles(
  particles: DepthParticle[],
  deltaTime: number,
  width: number,
  height: number,
): void {
  for (const p of particles) {
    p.y += p.speed * deltaTime * 10
    if (p.y > height) {
      p.y = 0
      p.x = Math.random() * width
    }
  }
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  particles: DepthParticle[],
  time: number,
): void {
  // Dark background
  ctx.fillStyle = COLORS.void
  ctx.fillRect(0, 0, width, height)

  // Animated dot grid
  const gridSize = 40
  const dotRadius = 1

  for (let x = gridSize; x < width; x += gridSize) {
    for (let y = gridSize; y < height; y += gridSize) {
      const pulse = Math.sin(time * 0.5 + x * 0.01 + y * 0.01) * 0.3 + 0.7
      ctx.beginPath()
      ctx.arc(x, y, dotRadius * pulse, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(100, 200, 255, ${0.08 * pulse})`
      ctx.fill()
    }
  }

  // Depth particles (floating)
  for (const p of particles) {
    const flicker = Math.sin(time * 2 + p.x * 0.1) * 0.2 + 0.8
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100, 200, 255, ${p.brightness * flicker * 0.3})`
    ctx.fill()
  }

  // Subtle vignette
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, 0,
    width / 2, height / 2, Math.max(width, height) * 0.7
  )
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}
