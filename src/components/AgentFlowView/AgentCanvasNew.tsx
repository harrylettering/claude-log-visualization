import { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasBuilder } from './simulation/canvasBuilder'
import type { ParsedLogData } from '../../types/log'

type CanvasNodeData = {
  entityId: string
  entityType: string
  displayName: string
  x: number
  y: number
}

type CanvasEdgeData = {
  id: string
  source: string
  target: string
  linkType: string
  seqNum: number
}

type NodeBox = {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

type ActiveParticle = {
  edgeId: string
  progress: number
  color: string
}

type EdgeStatus = {
  edgeId: string | null
  title: string
  detail: string
}

type SceneInfo = {
  sceneId: number
  startTime: number
  endTime: number
}

type SceneRenderState = {
  opacity: number
  shiftX: number
}

type EdgePoint = {
  x: number
  y: number
}

type EdgePath = {
  start: EdgePoint
  cp1: EdgePoint
  cp2: EdgePoint
  end: EdgePoint
}

type ToolVisualCategory =
  | 'file'
  | 'shell'
  | 'task'
  | 'agent'
  | 'plan'
  | 'network'
  | 'user'
  | 'system'
  | 'generic'

const COLORS = {
  bg: '#07111f',
  bgTop: '#10253c',
  panel: 'rgba(9, 16, 28, 0.9)',
  panelBorder: 'rgba(148, 163, 184, 0.16)',
  text: '#e5eefc',
  textDim: '#8ca2be',
  textMuted: '#60758f',
  lane: 'rgba(148, 163, 184, 0.05)',
  laneBorder: 'rgba(148, 163, 184, 0.08)',
  nodeFill: 'rgba(9, 16, 28, 0.94)',
  nodeShadow: 'rgba(7, 17, 31, 0.55)',
  glow: 'rgba(125, 211, 252, 0.18)',
  accent: '#7dd3fc',
  completed: '#38bdf8',
} as const

const NODE_THEME: Record<string, { accent: string; badge: string }> = {
  user: { accent: '#34d399', badge: 'USER' },
  main_agent: { accent: '#7dd3fc', badge: 'MAIN' },
  assistant: { accent: '#a78bfa', badge: 'MODEL' },
  tool: { accent: '#f59e0b', badge: 'TOOL' },
}

const TOOL_THEME: Record<ToolVisualCategory, { accent: string; badge: string }> = {
  file: { accent: '#38bdf8', badge: 'FILE' },
  shell: { accent: '#f59e0b', badge: 'SHELL' },
  task: { accent: '#22c55e', badge: 'TASK' },
  agent: { accent: '#c084fc', badge: 'AGENT' },
  plan: { accent: '#e879f9', badge: 'PLAN' },
  network: { accent: '#60a5fa', badge: 'NET' },
  user: { accent: '#2dd4bf', badge: 'ASK' },
  system: { accent: '#f472b6', badge: 'SYS' },
  generic: { accent: '#f59e0b', badge: 'TOOL' },
}

const EDGE_COLORS: Record<string, string> = {
  thinking: '#a78bfa',
  agent_call: '#c084fc',
  tool_call: '#f59e0b',
  tool_result: '#fb7185',
  agent_result: '#22c55e',
  user_input: '#34d399',
  agent_receive: '#7dd3fc',
  agent_response: '#38bdf8',
  response: '#60a5fa',
}

const LANE_LABELS = [
  { key: 'user', label: 'User Input' },
  { key: 'main_agent', label: 'Main Agent' },
  { key: 'assistant', label: 'Reasoning' },
  { key: 'tool', label: 'Tooling' },
]

const SPEED_OPTIONS = [0.25, 0.5, 1, 2]
const PARTICLE_DURATION = 1.15
const POST_FADE_DURATION = 0.38
const CAMERA_LERP = 0.12
const STEP_INTERVAL = 1.7
const SCENE_HOLD_DURATION = 0.42
const SCENE_SHIFT_DISTANCE = 140

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const value = Number.parseInt(clean, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getNodeBox(node: CanvasNodeData): NodeBox {
  const baseWidth = node.entityType === 'tool' ? 196 : 164
  const extraWidth = Math.min(96, Math.max(0, (node.displayName.length - 10) * 6))
  const width = baseWidth + extraWidth
  const height = node.entityType === 'tool' ? 58 : 76
  return {
    x: node.x - width / 2,
    y: node.y - height / 2,
    width,
    height,
    radius: node.entityType === 'tool' ? 18 : 22,
  }
}

function getToolCategory(displayName: string): ToolVisualCategory {
  const raw = displayName.replace(/^tool:/i, '').toLowerCase()
  if (['read', 'write', 'edit', 'glob', 'grep'].includes(raw)) return 'file'
  if (raw === 'bash') return 'shell'
  if (['taskcreate', 'taskget', 'tasklist', 'taskupdate'].includes(raw)) return 'task'
  if (raw === 'agent') return 'agent'
  if (['enterplanmode', 'exitplanmode'].includes(raw)) return 'plan'
  if (['webfetch', 'websearch'].includes(raw)) return 'network'
  if (raw === 'askuserquestion') return 'user'
  if (['skill', 'toolsearch'].includes(raw)) return 'system'
  return 'generic'
}

function getNodeTheme(node: CanvasNodeData) {
  if (node.entityType === 'tool') {
    return TOOL_THEME[getToolCategory(node.displayName)]
  }
  return NODE_THEME[node.entityType] ?? NODE_THEME.tool
}

function getDisplayLabel(node: CanvasNodeData) {
  return node.displayName.replace(/^tool:/i, '')
}

function getEdgePath(source: CanvasNodeData, target: CanvasNodeData, offset = 0): EdgePath {
  const sourceBox = getNodeBox(source)
  const targetBox = getNodeBox(target)
  const direction = target.x >= source.x ? 1 : -1
  const start = {
    x: direction > 0 ? sourceBox.x + sourceBox.width : sourceBox.x,
    y: source.y + offset * 0.2,
  }
  const end = {
    x: direction > 0 ? targetBox.x : targetBox.x + targetBox.width,
    y: target.y + offset * 0.2,
  }
  const distance = Math.max(80, Math.abs(end.x - start.x))
  const verticalSwing = (target.y - source.y) * 0.16 + offset
  return {
    start,
    cp1: { x: start.x + direction * distance * 0.42, y: start.y + verticalSwing },
    cp2: { x: end.x - direction * distance * 0.42, y: end.y - verticalSwing },
    end,
  }
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function getBezierXY(path: EdgePath, t: number) {
  return {
    x: bezierPoint(t, path.start.x, path.cp1.x, path.cp2.x, path.end.x),
    y: bezierPoint(t, path.start.y, path.cp1.y, path.cp2.y, path.end.y),
  }
}

function getEdgeTiming(currentTime: number, edgeTime?: number) {
  if (edgeTime === undefined || currentTime < edgeTime) {
    return { active: false, pulseProgress: 0, pulseAlpha: 0 }
  }
  if (currentTime <= edgeTime + PARTICLE_DURATION) {
    const progress = (currentTime - edgeTime) / PARTICLE_DURATION
    return {
      active: true,
      pulseProgress: progress,
      pulseAlpha: 0.42 + (1 - Math.abs(progress - 0.45)) * 0.52,
    }
  }
  return { active: false, pulseProgress: 1, pulseAlpha: 0 }
}

function getNodeProgress(currentTime: number, nodeTime?: number) {
  if (nodeTime === undefined || currentTime < nodeTime) return 0
  return Math.min(1, (currentTime - nodeTime) / 0.5)
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, box.radius)
}

function drawChamferedRect(ctx: CanvasRenderingContext2D, box: NodeBox, cut = 14) {
  ctx.beginPath()
  ctx.moveTo(box.x + cut, box.y)
  ctx.lineTo(box.x + box.width - cut, box.y)
  ctx.lineTo(box.x + box.width, box.y + cut)
  ctx.lineTo(box.x + box.width, box.y + box.height - cut)
  ctx.lineTo(box.x + box.width - cut, box.y + box.height)
  ctx.lineTo(box.x + cut, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height - cut)
  ctx.lineTo(box.x, box.y + cut)
  ctx.closePath()
}

function drawHexPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  const inset = 18
  ctx.beginPath()
  ctx.moveTo(box.x + inset, box.y)
  ctx.lineTo(box.x + box.width - inset, box.y)
  ctx.lineTo(box.x + box.width, box.y + box.height / 2)
  ctx.lineTo(box.x + box.width - inset, box.y + box.height)
  ctx.lineTo(box.x + inset, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height / 2)
  ctx.closePath()
}

function drawTerminalPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 14)
  ctx.moveTo(box.x + 18, box.y + 10)
  ctx.lineTo(box.x + 42, box.y + 10)
  ctx.lineTo(box.x + 34, box.y + 20)
  ctx.closePath()
}

function drawStackPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x + 10, box.y - 6, box.width - 20, box.height, 16)
  ctx.roundRect(box.x + 5, box.y - 3, box.width - 10, box.height, 16)
  ctx.roundRect(box.x, box.y, box.width, box.height, 16)
}

function drawDiamondPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.moveTo(box.x + box.width * 0.14, box.y)
  ctx.lineTo(box.x + box.width, box.y)
  ctx.lineTo(box.x + box.width * 0.86, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height)
  ctx.closePath()
}

function drawSpeechPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 18)
  ctx.moveTo(box.x + 36, box.y + box.height)
  ctx.lineTo(box.x + 54, box.y + box.height)
  ctx.lineTo(box.x + 42, box.y + box.height + 12)
  ctx.closePath()
}

function drawBracketPanel(ctx: CanvasRenderingContext2D, box: NodeBox) {
  ctx.beginPath()
  ctx.moveTo(box.x + 14, box.y)
  ctx.lineTo(box.x + box.width - 14, box.y)
  ctx.lineTo(box.x + box.width, box.y + 14)
  ctx.lineTo(box.x + box.width, box.y + box.height - 14)
  ctx.lineTo(box.x + box.width - 14, box.y + box.height)
  ctx.lineTo(box.x + 14, box.y + box.height)
  ctx.lineTo(box.x, box.y + box.height - 14)
  ctx.lineTo(box.x, box.y + 14)
  ctx.closePath()
}

function drawNodeShape(ctx: CanvasRenderingContext2D, node: CanvasNodeData, box: NodeBox) {
  if (node.entityType === 'user') {
    drawSpeechPanel(ctx, box)
    return
  }
  if (node.entityType === 'main_agent') {
    drawChamferedRect(ctx, box, 16)
    return
  }
  if (node.entityType === 'assistant') {
    drawDiamondPanel(ctx, box)
    return
  }

  switch (getToolCategory(node.displayName)) {
    case 'file':
      drawChamferedRect(ctx, box, 18)
      break
    case 'shell':
      drawTerminalPanel(ctx, box)
      break
    case 'task':
      drawStackPanel(ctx, box)
      break
    case 'agent':
      drawHexPanel(ctx, box)
      break
    case 'plan':
      drawDiamondPanel(ctx, box)
      break
    case 'network':
      drawHexPanel(ctx, box)
      break
    case 'user':
      drawSpeechPanel(ctx, box)
      break
    case 'system':
      drawBracketPanel(ctx, box)
      break
    default:
      drawRoundedRect(ctx, box)
      break
  }
}

function drawSelfLoop(
  ctx: CanvasRenderingContext2D,
  node: CanvasNodeData,
  color: string,
  alpha: number,
  active: boolean
) {
  const box = getNodeBox(node)
  const loopX = node.x + box.width * 0.08
  const loopY = box.y - 16
  const radiusX = 34
  const radiusY = 18

  ctx.save()
  ctx.strokeStyle = withAlpha(color, alpha)
  ctx.lineWidth = active ? 3 : 2
  ctx.beginPath()
  ctx.ellipse(loopX, loopY, radiusX, radiusY, 0, Math.PI * 0.1, Math.PI * 1.8)
  ctx.stroke()

  const headX = loopX + radiusX * 0.9
  const headY = loopY - radiusY * 0.2
  ctx.beginPath()
  ctx.moveTo(headX, headY)
  ctx.lineTo(headX - 8, headY - 4)
  ctx.lineTo(headX - 6, headY + 5)
  ctx.closePath()
  ctx.fillStyle = withAlpha(color, alpha)
  ctx.fill()
  ctx.restore()
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angle: number,
  color: string,
  alpha: number
) {
  const size = 9
  ctx.save()
  ctx.translate(tipX, tipY)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(-size, size * 0.52)
  ctx.lineTo(-size, -size * 0.52)
  ctx.closePath()
  ctx.fillStyle = withAlpha(color, alpha)
  ctx.fill()
  ctx.restore()
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  source: CanvasNodeData,
  target: CanvasNodeData,
  color: string,
  alpha: number,
  active: boolean,
  offset: number
) {
  const path = getEdgePath(source, target, offset)

  ctx.save()
  ctx.lineCap = 'round'

  ctx.strokeStyle = withAlpha(color, alpha * 0.78)
  ctx.lineWidth = active ? 4.5 : 2.6
  ctx.beginPath()
  ctx.moveTo(path.start.x, path.start.y)
  ctx.bezierCurveTo(path.cp1.x, path.cp1.y, path.cp2.x, path.cp2.y, path.end.x, path.end.y)
  ctx.stroke()

  ctx.strokeStyle = withAlpha('#ffffff', active ? 0.24 : 0.12)
  ctx.lineWidth = active ? 1.25 : 0.8
  ctx.beginPath()
  ctx.moveTo(path.start.x, path.start.y)
  ctx.bezierCurveTo(path.cp1.x, path.cp1.y, path.cp2.x, path.cp2.y, path.end.x, path.end.y)
  ctx.stroke()

  const tip = getBezierXY(path, 1)
  const beforeTip = getBezierXY(path, 0.97)
  drawArrowHead(ctx, tip.x, tip.y, Math.atan2(tip.y - beforeTip.y, tip.x - beforeTip.x), color, Math.max(alpha, 0.24))
  ctx.restore()
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  source: CanvasNodeData,
  target: CanvasNodeData,
  progress: number,
  color: string,
  offset: number
) {
  const path = getEdgePath(source, target, offset)
  const head = getBezierXY(path, progress)
  const tail = getBezierXY(path, Math.max(0, progress - 0.08))

  ctx.save()
  ctx.strokeStyle = withAlpha(color, 0.65)
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(tail.x, tail.y)
  ctx.lineTo(head.x, head.y)
  ctx.stroke()

  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, 14)
  glow.addColorStop(0, withAlpha(color, 0.95))
  glow.addColorStop(1, withAlpha(color, 0))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(head.x, head.y, 14, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(head.x, head.y, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNodeData,
  progress: number,
  emphasis: number
) {
  const theme = getNodeTheme(node)
  const box = getNodeBox(node)
  const accent = theme.accent
  const label = getDisplayLabel(node)

  ctx.save()
  if (emphasis > 0) {
    const halo = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, box.width * 0.75)
    halo.addColorStop(0, withAlpha(accent, 0.24 * emphasis))
    halo.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }

  if (node.entityType === 'main_agent') {
    const stage = ctx.createRadialGradient(node.x, node.y, box.width * 0.12, node.x, node.y, box.width * 1.15)
    stage.addColorStop(0, withAlpha(accent, 0.22 + emphasis * 0.12))
    stage.addColorStop(0.55, withAlpha(accent, 0.08))
    stage.addColorStop(1, withAlpha(accent, 0))
    ctx.fillStyle = stage
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * 1.15, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = withAlpha(accent, 0.28)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * 0.72, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(node.x, node.y, box.width * 0.9, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.shadowColor = COLORS.nodeShadow
  ctx.shadowBlur = 24 + emphasis * 16
  ctx.shadowOffsetY = 12
  drawNodeShape(ctx, node, box)
  ctx.fillStyle = COLORS.nodeFill
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.strokeStyle = withAlpha(accent, 0.18 + progress * 0.7 + emphasis * 0.28)
  ctx.lineWidth = 1.5 + progress * 1.4 + emphasis * 1.2
  drawNodeShape(ctx, node, box)
  ctx.stroke()

  const glow = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height)
  glow.addColorStop(0, withAlpha(accent, 0.18 + progress * 0.15 + emphasis * 0.12))
  glow.addColorStop(1, withAlpha('#ffffff', progress * 0.04 + emphasis * 0.05))
  drawNodeShape(ctx, node, box)
  ctx.fillStyle = glow
  ctx.fill()

  ctx.strokeStyle = withAlpha(accent, 0.22)
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(box.x + 14, box.y + 12)
  ctx.lineTo(box.x + box.width - 14, box.y + 12)
  ctx.moveTo(box.x + 14, box.y + box.height - 12)
  ctx.lineTo(box.x + box.width - 14, box.y + box.height - 12)
  ctx.stroke()

  ctx.fillStyle = withAlpha(accent, 0.95)
  ctx.beginPath()
  ctx.arc(box.x + 18, node.y, 5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = COLORS.text
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, box.x + 32, node.y - 8)

  ctx.fillStyle = COLORS.textDim
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace'
  const metaText = node.entityType === 'tool' ? getToolCategory(node.displayName).toUpperCase() : node.entityId
  ctx.fillText(metaText, box.x + 32, node.y + 13)

  const badgeWidth = 42 + theme.badge.length * 6.2
  ctx.fillStyle = withAlpha(accent, 0.14 + progress * 0.14)
  ctx.beginPath()
  ctx.roundRect(box.x + box.width - badgeWidth - 12, box.y + 10, badgeWidth, 22, 11)
  ctx.fill()
  ctx.strokeStyle = withAlpha(accent, 0.25 + progress * 0.35)
  ctx.stroke()

  ctx.fillStyle = withAlpha('#ffffff', 0.9)
  ctx.font = '700 10px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(theme.badge, box.x + box.width - badgeWidth / 2 - 12, box.y + 21)
  ctx.restore()
}

function getEdgeStatus(edge: CanvasEdgeData | null, nodes: Map<string, CanvasNodeData>): EdgeStatus {
  if (!edge) {
    return {
      edgeId: null,
      title: 'Step Transition',
      detail: 'Previous nodes are fading out while the next call prepares to appear.',
    }
  }

  const source = nodes.get(edge.source)
  const target = nodes.get(edge.target)
  const sourceName = source?.displayName ?? edge.source
  const targetName = target?.displayName ?? edge.target
  const descriptions: Record<string, string> = {
    user_input: 'User request enters the main agent pipeline.',
    agent_receive: 'Main Agent forwards input into the reasoning stage.',
    thinking: 'Assistant is internally reasoning before the next action.',
    agent_call: 'Assistant hands control back to Main Agent for orchestration.',
    tool_call: 'Main Agent dispatches a tool invocation.',
    tool_result: 'Tool output returns to Main Agent.',
    agent_result: 'Main Agent sends tool output back into reasoning.',
    agent_response: 'Assistant prepares the final response.',
    response: 'Main Agent returns the result to the user.',
  }

  return {
    edgeId: edge.id,
    title: `${sourceName} -> ${targetName}`,
    detail: descriptions[edge.linkType] ?? `${sourceName} communicates with ${targetName}.`,
  }
}

function getActiveEdgeAtTime(
  currentTime: number,
  edges: Map<string, CanvasEdgeData>,
  edgeTiming: Map<string, number>
) {
  for (const edge of edges.values()) {
    const time = edgeTiming.get(edge.id)
    if (time !== undefined && currentTime >= time && currentTime <= time + PARTICLE_DURATION) {
      return edge
    }
  }
  return null
}

function getEdgeOffset(edge: CanvasEdgeData, edges: Map<string, CanvasEdgeData>) {
  const reverseId = `${edge.target}-${edge.source}`
  if (!edges.has(reverseId)) return 0
  return edge.source < edge.target ? -42 : 42
}

function getSceneRenderState(currentTime: number, sceneId: number, scenes: Map<number, SceneInfo>): SceneRenderState {
  const scene = scenes.get(sceneId)
  if (!scene) return { opacity: 0, shiftX: 0 }

  const previousScene = scenes.get(sceneId - 1)
  const fadeInStart = previousScene ? previousScene.endTime : scene.startTime

  if (currentTime < fadeInStart) {
    return { opacity: 0, shiftX: SCENE_SHIFT_DISTANCE }
  }

  if (currentTime <= fadeInStart + POST_FADE_DURATION) {
    const progress = (currentTime - fadeInStart) / POST_FADE_DURATION
    return {
      opacity: Math.max(0, Math.min(1, progress)),
      shiftX: (1 - progress) * SCENE_SHIFT_DISTANCE,
    }
  }

  if (currentTime <= scene.endTime) {
    return { opacity: 1, shiftX: 0 }
  }

  if (currentTime <= scene.endTime + POST_FADE_DURATION) {
    const progress = (currentTime - scene.endTime) / POST_FADE_DURATION
    return {
      opacity: Math.max(0, 1 - progress),
      shiftX: -progress * SCENE_SHIFT_DISTANCE,
    }
  }

  return { opacity: 0, shiftX: -SCENE_SHIFT_DISTANCE }
}

function shiftNodeForScene(node: CanvasNodeData, shiftX: number): CanvasNodeData {
  if (node.entityId === '1') return node
  return {
    ...node,
    x: node.x + shiftX,
  }
}

interface AgentCanvasNewProps {
  data?: ParsedLogData | null
}

export function AgentCanvasNew({ data }: AgentCanvasNewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const [camera, setCamera] = useState({ scale: 1, offsetX: 0, offsetY: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(0.5)

  const canvasNodesRef = useRef<Map<string, CanvasNodeData>>(new Map())
  const canvasEdgesRef = useRef<Map<string, CanvasEdgeData>>(new Map())
  const edgeTimingRef = useRef<Map<string, number>>(new Map())
  const nodeTimingRef = useRef<Map<string, number>>(new Map())
  const edgeSceneRef = useRef<Map<string, number>>(new Map())
  const nodeSceneRef = useRef<Map<string, number>>(new Map())
  const sceneInfoRef = useRef<Map<number, SceneInfo>>(new Map())
  const totalDurationRef = useRef(0)

  const isPlayingRef = useRef(false)
  const speedRef = useRef(0.5)
  const animationIdRef = useRef<number>(0)
  const lastTimestampRef = useRef<number>(0)
  const currentTimeRef = useRef(0)
  const activeParticlesRef = useRef<ActiveParticle[]>([])

  const isDraggingRef = useRef(false)
  const lastMousePosRef = useRef({ x: 0, y: 0 })

  const activeEdge = getActiveEdgeAtTime(currentTime, canvasEdgesRef.current, edgeTimingRef.current)
  const activeEdgeStatus = getEdgeStatus(activeEdge, canvasNodesRef.current)

  const fitToView = useCallback((nodes: Map<string, CanvasNodeData>, width: number, height: number) => {
    if (nodes.size === 0 || width <= 0 || height <= 0) return
    const boxes = [...nodes.values()].map(getNodeBox)
    const minX = Math.min(...boxes.map((box) => box.x))
    const minY = Math.min(...boxes.map((box) => box.y))
    const maxX = Math.max(...boxes.map((box) => box.x + box.width))
    const maxY = Math.max(...boxes.map((box) => box.y + box.height))
    const contentWidth = maxX - minX
    const contentHeight = maxY - minY
    const padding = 120
    const scale = Math.min(
      1.25,
      Math.max(
        0.45,
        Math.min((width - padding) / Math.max(contentWidth, 1), (height - padding) / Math.max(contentHeight, 1))
      )
    )
    const contentCenterX = (minX + maxX) / 2
    const contentCenterY = (minY + maxY) / 2
    setCamera({
      scale,
      offsetX: width / 2 - contentCenterX * scale,
      offsetY: height / 2 - contentCenterY * scale,
    })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      if (width > 0 && height > 0) {
        setDimensions({ width, height })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!data?.entries?.length || dimensions.width <= 0 || dimensions.height <= 0) {
      canvasNodesRef.current = new Map()
      canvasEdgesRef.current = new Map()
      edgeTimingRef.current = new Map()
      nodeTimingRef.current = new Map()
      totalDurationRef.current = 0
      setIsPlaying(false)
      currentTimeRef.current = 0
      setCurrentTime(0)
      return
    }

    const builder = new CanvasBuilder()
    builder.buildCanvasGraph(data.entries)
    builder.initializePositions(dimensions.width, dimensions.height)

    const nodes = builder.getCanvasNodes()
    const rawEdges = builder.getCanvasEdges()
    const layers = builder.getLayers()

    const seenEdgeIds = new Set<string>()
    const edgeSequence = new Map<string, number>()
    const edgeTiming = new Map<string, number>()
    const nodeTiming = new Map<string, number>()
    const edgeScene = new Map<string, number>()
    const nodeScene = new Map<string, number>()
    const sceneInfo = new Map<number, SceneInfo>()

    let seqNum = 1
    let time = 0
    let sceneId = 0

    for (const layer of layers) {
      for (const virtualNode of layer.nodes) {
        for (const link of virtualNode.callLinks) {
          if (!seenEdgeIds.has(link.id)) {
            seenEdgeIds.add(link.id)
            edgeSequence.set(link.id, seqNum++)
            edgeTiming.set(link.id, time)
            edgeScene.set(link.id, sceneId)
            if (!nodeScene.has(link.source)) nodeScene.set(link.source, sceneId)
            if (!nodeScene.has(link.target)) nodeScene.set(link.target, sceneId)
            nodeTiming.set(link.source, Math.min(nodeTiming.get(link.source) ?? Number.POSITIVE_INFINITY, time))
            nodeTiming.set(link.target, Math.min(nodeTiming.get(link.target) ?? Number.POSITIVE_INFINITY, time + 0.08))

            const currentScene = sceneInfo.get(sceneId) ?? { sceneId, startTime: time, endTime: time + PARTICLE_DURATION }
            currentScene.startTime = Math.min(currentScene.startTime, time)
            currentScene.endTime = time + PARTICLE_DURATION
            sceneInfo.set(sceneId, currentScene)

            time += STEP_INTERVAL

            if (link.target === '1' && link.source !== link.target) {
              const holdScene = sceneInfo.get(sceneId)
              if (holdScene) {
                holdScene.endTime += SCENE_HOLD_DURATION
                sceneInfo.set(sceneId, holdScene)
              }
              time += SCENE_HOLD_DURATION
              sceneId += 1
            }
          }
        }
      }
    }

    const edges = new Map<string, CanvasEdgeData>()
    rawEdges.forEach((edge, key) => {
      edges.set(key, { ...edge, seqNum: edgeSequence.get(key) ?? 0 })
    })

    canvasNodesRef.current = nodes
    canvasEdgesRef.current = edges
    edgeTimingRef.current = edgeTiming
    nodeTimingRef.current = nodeTiming
    edgeSceneRef.current = edgeScene
    nodeSceneRef.current = nodeScene
    sceneInfoRef.current = sceneInfo
    totalDurationRef.current = Math.max(time + 0.9, 1.8)
    currentTimeRef.current = 0
    setCurrentTime(0)
    isPlayingRef.current = true
    setIsPlaying(true)
    activeParticlesRef.current = []
    fitToView(nodes, dimensions.width, dimensions.height)
  }, [data, dimensions, fitToView])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== dimensions.width * dpr || canvas.height !== dimensions.height * dpr) {
      canvas.width = dimensions.width * dpr
      canvas.height = dimensions.height * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)
    }

    const bg = ctx.createLinearGradient(0, 0, 0, dimensions.height)
    bg.addColorStop(0, COLORS.bgTop)
    bg.addColorStop(1, COLORS.bg)
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, dimensions.width, dimensions.height)

    ctx.save()
    ctx.translate(camera.offsetX, camera.offsetY)
    ctx.scale(camera.scale, camera.scale)

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.06)'
    ctx.lineWidth = 1
    for (let y = 70; y < dimensions.height / camera.scale; y += 72) {
      ctx.beginPath()
      ctx.moveTo(24, y)
      ctx.lineTo(dimensions.width / camera.scale - 24, y)
      ctx.stroke()
    }

    const highlightedNodes = new Set<string>()
    const visibleNodeOpacity = new Map<string, number>()
    canvasEdgesRef.current.forEach((edge) => {
      const edgeSceneId = edgeSceneRef.current.get(edge.id) ?? 0
      const sceneState = getSceneRenderState(currentTimeRef.current, edgeSceneId, sceneInfoRef.current)
      if (sceneState.opacity <= 0.01) return

      const rawSource = canvasNodesRef.current.get(edge.source)
      const rawTarget = canvasNodesRef.current.get(edge.target)
      if (!rawSource || !rawTarget) return
      const source = shiftNodeForScene(rawSource, sceneState.shiftX)
      const target = shiftNodeForScene(rawTarget, sceneState.shiftX)
      const color = EDGE_COLORS[edge.linkType] ?? COLORS.accent
      const timing = getEdgeTiming(currentTimeRef.current, edgeTimingRef.current.get(edge.id))
      const edgeOffset = getEdgeOffset(edge, canvasEdgesRef.current)
      const renderAlpha = sceneState.opacity * (timing.active ? Math.max(0.46, timing.pulseAlpha) : 0.24)

      visibleNodeOpacity.set(edge.source, Math.max(visibleNodeOpacity.get(edge.source) ?? 0, Math.min(1, renderAlpha + 0.18)))
      visibleNodeOpacity.set(edge.target, Math.max(visibleNodeOpacity.get(edge.target) ?? 0, Math.min(1, renderAlpha + 0.12)))

      if (timing.active) {
        highlightedNodes.add(edge.source)
        highlightedNodes.add(edge.target)
      }

      if (edge.source === edge.target) {
        drawSelfLoop(ctx, source, color, renderAlpha, timing.active)
      } else {
        drawEdge(ctx, source, target, color, renderAlpha, timing.active, edgeOffset)
      }

      if (renderAlpha > 0.18) {
        const sourceBox = getNodeBox(source)
        const targetBox = getNodeBox(target)
        const midX = (source.x + target.x) / 2
        const midY = (source.y + target.y) / 2
        ctx.fillStyle = withAlpha('#0b1627', 0.68 * renderAlpha)
        ctx.beginPath()
        ctx.roundRect(midX - 14, midY - 11, 28, 22, 11)
        ctx.fill()
        ctx.strokeStyle = withAlpha(color, 0.28 * renderAlpha)
        ctx.stroke()
        ctx.fillStyle = withAlpha('#c7d5e8', 0.85 * renderAlpha)
        ctx.font = '700 10px ui-monospace, SFMono-Regular, monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(edge.seqNum), (sourceBox.x + sourceBox.width + targetBox.x) / 2, midY)
      }
    })

    activeParticlesRef.current.forEach((particle) => {
      const edge = canvasEdgesRef.current.get(particle.edgeId)
      if (!edge) return
      const edgeSceneId = edgeSceneRef.current.get(edge.id) ?? 0
      const sceneState = getSceneRenderState(currentTimeRef.current, edgeSceneId, sceneInfoRef.current)
      if (sceneState.opacity <= 0.01) return
      const rawSource = canvasNodesRef.current.get(edge.source)
      const rawTarget = canvasNodesRef.current.get(edge.target)
      if (!rawSource || !rawTarget || edge.source === edge.target) return
      const source = shiftNodeForScene(rawSource, sceneState.shiftX)
      const target = shiftNodeForScene(rawTarget, sceneState.shiftX)
      drawParticle(ctx, source, target, particle.progress, particle.color, getEdgeOffset(edge, canvasEdgesRef.current))
    })

    if (currentTimeRef.current >= (nodeTimingRef.current.get('1') ?? Number.POSITIVE_INFINITY)) {
      visibleNodeOpacity.set('1', 1)
    }

    canvasNodesRef.current.forEach((node) => {
      const sceneShift =
        node.entityId === '1'
          ? 0
          : nodeSceneRef.current.has(node.entityId)
            ? getSceneRenderState(currentTimeRef.current, nodeSceneRef.current.get(node.entityId)!, sceneInfoRef.current).shiftX
            : 0
      const opacity = visibleNodeOpacity.get(node.entityId) ?? 0
      if (opacity <= 0.02) return
      ctx.save()
      ctx.globalAlpha = Math.min(1, opacity)
      drawNode(
        ctx,
        shiftNodeForScene(node, sceneShift),
        getNodeProgress(currentTimeRef.current, nodeTimingRef.current.get(node.entityId)),
        highlightedNodes.has(node.entityId) ? 1 : 0
      )
      ctx.restore()
    })

    ctx.restore()

    ctx.fillStyle = withAlpha(COLORS.textMuted, 0.7)
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    LANE_LABELS.forEach(({ key, label }) => {
      const laneNode = [...canvasNodesRef.current.values()].find((node) => node.entityType === key)
      if (!laneNode) return
      ctx.fillText(label.toUpperCase(), laneNode.x - 64, 30)
    })
  }, [camera, dimensions])

  const animateRef = useRef<(timestamp: number) => void>(() => {})

  animateRef.current = (timestamp: number) => {
    if (!lastTimestampRef.current) lastTimestampRef.current = timestamp
    const delta = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.1)
    lastTimestampRef.current = timestamp

    if (isPlayingRef.current) {
      const duration = totalDurationRef.current || 1
      currentTimeRef.current = Math.min(duration, currentTimeRef.current + delta * speedRef.current)
      setCurrentTime(currentTimeRef.current)

      const activeEdge = getActiveEdgeAtTime(currentTimeRef.current, canvasEdgesRef.current, edgeTimingRef.current)
      if (activeEdge && !isDraggingRef.current) {
        const source = canvasNodesRef.current.get(activeEdge.source)
        const target = canvasNodesRef.current.get(activeEdge.target)
        if (source && target) {
          const path = getEdgePath(source, target, getEdgeOffset(activeEdge, canvasEdgesRef.current))
          const focusX = path.start.x
          const focusY = path.start.y
          setCamera((prev) => {
            const nextScale = prev.scale
            const targetOffsetX = dimensions.width / 2 - focusX * nextScale
            const targetOffsetY = dimensions.height / 2 - focusY * nextScale
            return {
              scale: nextScale,
              offsetX: prev.offsetX + (targetOffsetX - prev.offsetX) * CAMERA_LERP,
              offsetY: prev.offsetY + (targetOffsetY - prev.offsetY) * CAMERA_LERP,
            }
          })
        }
      }

      const particles: ActiveParticle[] = []
      edgeTimingRef.current.forEach((time, edgeId) => {
        const elapsed = currentTimeRef.current - time
        if (elapsed >= 0 && elapsed <= PARTICLE_DURATION) {
          const edge = canvasEdgesRef.current.get(edgeId)
          if (!edge) return
          particles.push({
            edgeId,
            progress: Math.min(1, elapsed / PARTICLE_DURATION),
            color: EDGE_COLORS[edge.linkType] ?? COLORS.accent,
          })
        }
      })
      activeParticlesRef.current = particles

      if (currentTimeRef.current >= duration) {
        isPlayingRef.current = false
        setIsPlaying(false)
      }
    }

    drawFrame()
    animationIdRef.current = requestAnimationFrame(animateRef.current)
  }

  useEffect(() => {
    animationIdRef.current = requestAnimationFrame(animateRef.current)
    return () => {
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)
    }
  }, [drawFrame])

  const handlePlayPause = useCallback(() => {
    if (currentTimeRef.current >= totalDurationRef.current) {
      currentTimeRef.current = 0
      setCurrentTime(0)
    }
    setIsPlaying((prev) => !prev)
  }, [])

  const handleRestart = useCallback(() => {
    currentTimeRef.current = 0
    lastTimestampRef.current = 0
    activeParticlesRef.current = []
    setCurrentTime(0)
    setIsPlaying(true)
  }, [])

  const handleResetView = useCallback(() => {
    fitToView(canvasNodesRef.current, dimensions.width, dimensions.height)
  }, [dimensions, fitToView])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const zoom = e.deltaY > 0 ? 0.92 : 1.08
    setCamera((prev) => ({
      ...prev,
      scale: Math.min(2.2, Math.max(0.35, prev.scale * zoom)),
    }))
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastMousePosRef.current.x
    const dy = e.clientY - lastMousePosRef.current.y
    lastMousePosRef.current = { x: e.clientX, y: e.clientY }
    setCamera((prev) => ({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy,
    }))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const totalDuration = totalDurationRef.current || 1
  const progressPct = Math.min(100, (currentTime / totalDuration) * 100)

  return (
    <div className="flex h-full flex-col" style={{ background: COLORS.bg }}>
      <div
        className="flex items-center gap-3 border-b px-4"
        style={{ height: 54, background: COLORS.panel, borderColor: COLORS.panelBorder }}
      >
        <button
          onClick={handlePlayPause}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{
            background: isPlaying ? withAlpha('#f59e0b', 0.2) : withAlpha('#38bdf8', 0.22),
            color: isPlaying ? '#fbbf24' : '#7dd3fc',
          }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleRestart}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: 'rgba(30, 41, 59, 0.72)', color: COLORS.textDim }}
        >
          Restart
        </button>
        <button
          onClick={handleResetView}
          className="rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: 'rgba(30, 41, 59, 0.72)', color: COLORS.textDim }}
        >
          Reset View
        </button>

        <div className="ml-3 flex items-center gap-2">
          {SPEED_OPTIONS.map((option) => (
            <button
              key={option}
              onClick={() => setSpeed(option)}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: option === speed ? withAlpha('#7dd3fc', 0.18) : 'rgba(30, 41, 59, 0.72)',
                color: option === speed ? COLORS.text : COLORS.textMuted,
                border: `1px solid ${option === speed ? withAlpha('#7dd3fc', 0.28) : 'transparent'}`,
              }}
            >
              {option}x
            </button>
          ))}
        </div>

        <div className="ml-auto flex min-w-[240px] items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800/70">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: 'linear-gradient(90deg, #34d399 0%, #7dd3fc 55%, #a78bfa 100%)',
              }}
            />
          </div>
          <span className="w-14 text-right text-xs font-medium" style={{ color: COLORS.textMuted }}>
            {currentTime.toFixed(1)}s
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
      >
        <canvas ref={canvasRef} className="h-full w-full" style={{ width: '100%', height: '100%' }} />

        <div
          className="absolute right-4 top-4 w-[320px] rounded-2xl border px-4 py-3 text-xs"
          style={{ background: COLORS.panel, borderColor: COLORS.panelBorder, color: COLORS.textDim }}
        >
          <div className="mb-2 text-[11px] font-semibold tracking-[0.18em]" style={{ color: COLORS.textMuted }}>
            CURRENT STEP
          </div>
          <div className="mb-3">
            <div className="text-sm font-semibold" style={{ color: COLORS.text }}>
              {activeEdgeStatus.title}
            </div>
            <div className="mt-1 leading-5" style={{ color: COLORS.textDim }}>
              {activeEdgeStatus.detail}
            </div>
          </div>
          <div className="border-t pt-3" style={{ borderColor: COLORS.panelBorder }}>
            <div className="mb-2 text-[11px] font-semibold tracking-[0.18em]" style={{ color: COLORS.textMuted }}>
              VISUAL SYSTEM
            </div>
            <div className="space-y-1">
              <div>Only the current step and its nearby transition are visible.</div>
              <div>Previous nodes fade out while the next call fades in.</div>
              <div>The camera follows the active edge start so playback stays centered.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
