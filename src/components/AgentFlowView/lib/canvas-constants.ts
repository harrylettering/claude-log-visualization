/**
 * Canvas drawing constants for animation and layout.
 */

// ─── Model context sizes ────────────────────────────────────────────────────

export const MODEL_CONTEXT_SIZES: Record<string, number> = {
  'opus-4-6': 1_000_000,
  'sonnet-4-6': 1_000_000,
}
export const DEFAULT_CONTEXT_SIZE = 200_000
export const FALLBACK_CONTEXT_SIZE = 1_000_000

// ─── Visibility threshold ────────────────────────────────────────────────────

export const MIN_VISIBLE_OPACITY = 0.05

// ─── Agent spawn distance ────────────────────────────────────────────────────

export const AGENT_SPAWN_DISTANCE = 250

// ─── Animation speed multipliers ──────────────────────────────────────────────

export const ANIM_SPEED = {
  agentFadeIn: 3,
  agentScaleIn: 4,
  agentFadeOut: 0.4,
  agentScaleOut: 0.05,
  toolFadeIn: 4,
  toolFadeOut: 1.5,
  edgeFadeIn: 4,
  discoveryFadeIn: 2,
  discoveryFadeOut: 0.5,
  particleSpeed: 1.2,
  maxDeltaTime: 0.1,
  defaultDeltaTime: 0.016,
  minFrameInterval: (1000 / 60) - 1,
} as const

// ─── Agent drawing constants ────────────────────────────────────────────────

export const AGENT_DRAW = {
  radiusMain: 28,
  radiusSub: 20,
  bubbleAnchorOffset: 14,
  bubbleCursorY: -20,
  glowPadding: 20,
  outerRingOffset: 3,
  shadowBlur: 15,
  shadowOffsetX: 3,
  shadowOffsetY: 5,
  labelYOffset: 8,
  labelWidthMultiplier: 3,
  scanlineHalfH: 4,
  scanlineWidth: 8,
  waitingDashSpeed: 25,
  orbitParticleOffset: 12,
  orbitParticleSize: 1.5,
  rippleInnerOffset: 5,
  rippleMaxExpand: 45,
  rippleMaxAlpha: 0.4,
  waitingOrbitOffset: 14,
  waitingOrbitParticleSize: 2,
  waitingOrbitSpeed: 0.8,
  waitingBreatheSpeed: 1.2,
  waitingBreatheAmp: 0.08,
} as const

// ─── Context bar drawing constants ────────────────────────────────────────────

export const CONTEXT_BAR = {
  minWidth: 60,
  widthMultiplier: 2.2,
  barHeight: 6,
  yOffset: 22,
  borderRadius: 3,
  fontSize: 7,
  labelPadding: 9,
} as const

// ─── Context ring drawing constants ──────────────────────────────────────────

export const CONTEXT_RING = {
  ringOffset: 8,
  ringWidth: 4,
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  percentLabelThreshold: 0.7,
  glowPadding: 4,
  glowLineWidth: 2,
  glowBlur: 12,
  percentYOffset: 10,
} as const

// ─── Tool card drawing constants ─────────────────────────────────────────────

export const TOOL_DRAW = {
  fontSize: 8,
  borderRadius: 4,
  expandedHeight: 30,
  collapsedHeight: 24,
  errorGlowBase: 8,
  errorGlowPulse: 4,
  spinRingPadding: 4,
  spinSpeed: 3,
  spinArc: Math.PI * 1.2,
  errorFontSize: 6,
  tokenFontSize: 6,
  twoLineOffset: 5,
} as const

// ─── Particle drawing constants ────────────────────────────────────────────────

export const PARTICLE_DRAW = {
  glowRadius: 15,
  coreHighlightScale: 0.4,
  labelMinT: 0.2,
  labelMaxT: 0.8,
  labelFontSize: 8,
  labelYOffset: -12,
} as const

// ─── Effect drawing constants ────────────────────────────────────────────────

export const FX = {
  spawnDuration: 0.8,
  completeDuration: 1.0,
  shatterDuration: 0.8,
  shatterCount: 12,
  shatterSpeed: { min: 30, range: 60 },
  shatterSize: { min: 1, range: 2 },
  trailSegments: 8,
} as const

// ─── Beam/Edge drawing constants ──────────────────────────────────────────────

export const BEAM = {
  curvature: 0.15,
  cp1: 0.33,
  cp2: 0.66,
  segments: 16,
  parentChild: { startW: 3, endW: 1 },
  tool: { startW: 1.5, endW: 0.5 },
  glowExtra: { startW: 3, endW: 1, alpha: 0.08 },
  idleAlpha: 0.08,
  activeAlpha: 0.3,
  wobble: { amp: 3, freq: 10, timeFreq: 3, trailOffset: 0.15 },
} as const

// ─── Animation constants ─────────────────────────────────────────────────────

export const ANIM = {
  inertiaDecay: 0.94,
  inertiaThreshold: 0.5,
  dragLerp: 0.25,
  autoFitLerp: 0.06,
  dragThresholdPx: 5,
  viewportPadding: 120,
  breathe: {
    thinkingSpeed: 2, thinkingAmp: 0.03,
    idleSpeed: 0.7, idleAmp: 0.015,
  },
  scanline: { thinking: 40, normal: 15 },
  orbitSpeed: 1.5,
  pulseSpeed: 4,
} as const

// ─── Force simulation config ────────────────────────────────────────────────

export const FORCE = {
  chargeStrength: -1200,
  centerStrength: 0.03,
  collideRadius: 140,
  linkDistance: 350,
  linkStrength: 0.4,
  alphaDecay: 0.02,
  velocityDecay: 0.4,
} as const

// ─── Tool slot placement config ─────────────────────────────────────────────

export const TOOL_SLOT = {
  maxRings: 5,
  baseDistance: 100,
  ringIncrement: 35,
  baseSteps: 5,
  stepsPerRing: 2,
  fallbackDistance: 90,
} as const

// ─── Timeline constants ──────────────────────────────────────────────────────

export const TIMELINE = {
  rowHeight: 32,
  headerHeight: 28,
  timeScale: 50, // pixels per second
} as const
