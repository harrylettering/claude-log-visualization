/**
 * Agent Flow Dashboard - Canvas 2D based visualization.
 * Uses the new CallGraphBuilder with uuid/parentUuid tree structure
 * for accurate call chain visualization.
 */

import type { ParsedLogData } from '../types/log'
import { AgentCanvasNew } from './AgentFlowView/AgentCanvasNew'

interface AgentFlowViewProps {
  data?: ParsedLogData | null
}

export function AgentFlowView({ data }: AgentFlowViewProps) {
  return <AgentCanvasNew data={data ?? null} />
}
