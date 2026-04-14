/**
 * Mock scenario with timed events for the simulation.
 */

import type { SimulationEvent } from './types'

export const MOCK_SCENARIO: SimulationEvent[] = [
  // Time 0: Spawn main orchestrator
  {
    time: 0,
    type: 'agent_spawn',
    payload: {
      id: 'main-agent',
      name: 'Orchestrator',
      parentId: null,
      isMain: true,
      x: 400,
      y: 300,
    },
  },
  // Time 0.5: Main agent starts thinking
  {
    time: 0.5,
    type: 'agent_thinking',
    payload: {
      id: 'main-agent',
      thinking: 'Analyzing the codebase structure...',
    },
  },
  // Time 1: Spawn sub-agent
  {
    time: 1.0,
    type: 'agent_spawn',
    payload: {
      id: 'sub-agent-1',
      name: 'Code Analyzer',
      parentId: 'main-agent',
      isMain: false,
      x: 250,
      y: 180,
    },
  },
  // Time 1.2: Sub-agent thinking
  {
    time: 1.2,
    type: 'agent_thinking',
    payload: {
      id: 'sub-agent-1',
      thinking: 'Scanning for TypeScript files...',
    },
  },
  // Time 1.5: Tool call from main agent
  {
    time: 1.5,
    type: 'tool_call_start',
    payload: {
      id: 'tool-1',
      agentId: 'main-agent',
      toolName: 'Bash',
      args: 'find . -name "*.ts" | head -20',
      x: 550,
      y: 200,
    },
  },
  // Time 1.8: Particle dispatch from main to sub-agent
  {
    time: 1.8,
    type: 'particle_spawn',
    payload: {
      id: 'particle-1',
      edgeId: 'edge-main-sub1',
      type: 'dispatch',
      color: '#cc88ff',
    },
  },
  // Time 2.0: Tool call end
  {
    time: 2.0,
    type: 'tool_call_end',
    payload: {
      id: 'tool-1',
      result: 'Found 24 TypeScript files',
    },
  },
  // Time 2.2: Another sub-agent
  {
    time: 2.2,
    type: 'agent_spawn',
    payload: {
      id: 'sub-agent-2',
      name: 'File Writer',
      parentId: 'main-agent',
      isMain: false,
      x: 550,
      y: 420,
    },
  },
  // Time 2.5: Tool call from sub-agent
  {
    time: 2.5,
    type: 'tool_call_start',
    payload: {
      id: 'tool-2',
      agentId: 'sub-agent-1',
      toolName: 'Read',
      args: 'src/App.tsx',
      x: 150,
      y: 280,
    },
  },
  // Time 2.8: Particle return
  {
    time: 2.8,
    type: 'particle_spawn',
    payload: {
      id: 'particle-2',
      edgeId: 'edge-main-sub1',
      type: 'return',
      color: '#66ffaa',
    },
  },
  // Time 3.0: Tool call end
  {
    time: 3.0,
    type: 'tool_call_end',
    payload: {
      id: 'tool-2',
      result: 'Read 245 lines',
    },
  },
  // Time 3.2: Sub-agent 1 complete
  {
    time: 3.5,
    type: 'agent_complete',
    payload: {
      id: 'sub-agent-1',
    },
  },
  // Time 3.8: Sub-agent 2 starts tool call
  {
    time: 3.8,
    type: 'tool_call_start',
    payload: {
      id: 'tool-3',
      agentId: 'sub-agent-2',
      toolName: 'Edit',
      args: 'src/components/AgentFlowView.tsx',
      x: 650,
      y: 320,
    },
  },
  // Time 4.0: Particle dispatch to sub-agent-2
  {
    time: 4.0,
    type: 'particle_spawn',
    payload: {
      id: 'particle-3',
      edgeId: 'edge-main-sub2',
      type: 'dispatch',
      color: '#cc88ff',
    },
  },
  // Time 4.5: Tool call end
  {
    time: 4.5,
    type: 'tool_call_end',
    payload: {
      id: 'tool-3',
      result: 'Applied changes',
    },
  },
  // Time 5.0: Sub-agent 2 complete
  {
    time: 5.0,
    type: 'agent_complete',
    payload: {
      id: 'sub-agent-2',
    },
  },
  // Time 5.5: Main agent thinking
  {
    time: 5.5,
    type: 'agent_thinking',
    payload: {
      id: 'main-agent',
      thinking: 'Finalizing results...',
    },
  },
  // Time 6.0: Main agent complete
  {
    time: 6.5,
    type: 'agent_complete',
    payload: {
      id: 'main-agent',
    },
  },
]
