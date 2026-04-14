/**
 * Holographic color palette and role color definitions.
 */

export const COLORS = {
  // Background
  void: '#050510',
  hexGrid: '#0d0d1f',

  // Primary Hologram
  holoBase: '#66ccff',
  holoBright: '#aaeeff',
  holoHot: '#ffffff',

  // Agent States
  idle: '#66ccff',
  thinking: '#66ccff',
  tool_calling: '#ffbb44',
  complete: '#66ffaa',
  error: '#ff5566',
  paused: '#888899',
  waiting_permission: '#ffaa33',

  // Edge/Particle Colors
  dispatch: '#cc88ff',
  return: '#66ffaa',
  tool: '#ffbb44',
  message: '#66ccff',

  // Context breakdown colors
  contextSystem: '#555577',
  contextUser: '#66ccff',
  contextToolResults: '#ffbb44',
  contextReasoning: '#cc88ff',
  contextSubagent: '#66ffaa',

  // UI Chrome
  nodeInterior: 'rgba(10, 15, 40, 0.5)',
  textPrimary: '#aaeeff',
  textDim: '#66ccff90',
  textMuted: '#66ccff50',

  // Glass card
  glassBg: 'rgba(10, 15, 30, 0.7)',
  glassBorder: 'rgba(100, 200, 255, 0.15)',
  glassHighlight: 'rgba(100, 200, 255, 0.08)',

  // Holo background/border opacities
  holoBg03: 'rgba(100, 200, 255, 0.03)',
  holoBg05: 'rgba(100, 200, 255, 0.05)',
  holoBg10: 'rgba(100, 200, 255, 0.1)',
  holoBorder06: 'rgba(100, 200, 255, 0.06)',
  holoBorder08: 'rgba(100, 200, 255, 0.08)',
  holoBorder10: 'rgba(100, 200, 255, 0.1)',
  holoBorder12: 'rgba(100, 200, 255, 0.12)',

  // Panel chrome
  panelBg: 'rgba(8, 12, 24, 0.85)',
  panelSeparator: 'rgba(100, 200, 255, 0.04)',

  // Discovery type colors
  discoveryFile: '#66ccff',
  discoveryPattern: '#cc88ff',
  discoveryFinding: '#66ffaa',
  discoveryCode: '#ffbb44',

  // Canvas drawing — agent/tool card backgrounds
  cardBgDark: 'rgba(5, 5, 16, 0.8)',
  cardBg: 'rgba(10, 15, 30, 0.6)',
  cardBgSelected: 'rgba(10, 15, 30, 0.8)',
  cardBgError: 'rgba(40, 10, 15, 0.8)',
  cardBgSelectedHolo: 'rgba(100, 200, 255, 0.15)',

  // Canvas drawing — cost labels
  costText: '#66ffaa',
  costTextDim: '#66ffaa80',
  costPillBg: 'rgba(10, 20, 40, 0.75)',
  costPillStroke: 'rgba(102, 255, 170, 0.3)',

  // Canvas drawing — cost panel bar fills
  barFillMain: 'rgba(102, 204, 255, 0.15)',
  barFillSub: 'rgba(204, 136, 255, 0.15)',
} as const

export type AgentState = 'idle' | 'thinking' | 'tool_calling' | 'complete' | 'error' | 'paused' | 'waiting_permission'

export function getStateColor(state: AgentState): string {
  switch (state) {
    case 'idle': return COLORS.idle
    case 'thinking': return COLORS.thinking
    case 'tool_calling': return COLORS.tool_calling
    case 'complete': return COLORS.complete
    case 'error': return COLORS.error
    case 'paused': return COLORS.paused
    case 'waiting_permission': return COLORS.waiting_permission
  }
}
