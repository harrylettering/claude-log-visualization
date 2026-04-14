import type { ParsedLogData, LogEntry } from '../types/log'
import type { FlowGraph, FlowNode, FlowEdge, MergedEdge, NodeType, EdgeSemantics, EntityType, ActionType } from '../types/flow'
import { PRICING } from '../constants'

// ─── Entity & Action Classification (per document spec) ─────────────────────────

export interface ParsedEntityInfo {
  entityType: EntityType
  actionType: ActionType
  contentSummary: string
  toolName?: string
  toolId?: string
  correlationId?: string  // tool_use_id for matching call/result
}

/**
 * Classify entity type based on document rules:
 * - type="user" + message.role="user" + text content → User
 * - type="user" + message.role="user" + tool_result array → Tool/SubAgent result
 * - type="assistant" + message.role="assistant" → MainAgent
 * - type="system"/"permission-mode"/"file-history-snapshot" → SystemEnv
 */
export function classifyEntityType(entry: LogEntry): EntityType {
  // System environment events
  if (entry.type === 'system' || entry.type === 'permission-mode' ||
      entry.type === 'file-history-snapshot' || entry.type === 'file-history') {
    return 'SystemEnv'
  }

  // Assistant → Main Agent
  if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
    return 'MainAgent'
  }

  // User messages
  if (entry.type === 'user' && entry.message?.role === 'user') {
    const blocks = Array.isArray(entry.message.content) ? entry.message.content : []

    // Check if this is a tool_result masquerading as user message
    const hasToolResult = blocks.some(b => b.type === 'tool_result')
    if (hasToolResult) {
      // Further classify based on sourceToolAssistantUUID
      if (entry.isSidechain || entry.sourceToolAssistantUUID) {
        return 'SubAgent'
      }
      return 'GenericTool'
    }

    // This is a real user input
    return 'User'
  }

  return 'Unknown'
}

/**
 * Classify action type based on content blocks
 */
export function classifyActionType(entry: LogEntry): ActionType {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []

  // Check for tool calls first
  const hasToolCall = blocks.some(b => b.type === 'tool_use')
  if (hasToolCall) return 'ToolCall'

  // Check for tool results
  const hasToolResult = blocks.some(b => b.type === 'tool_result')
  if (hasToolResult) return 'ToolResult'

  // Check for thinking
  const hasThinking = blocks.some(b => b.type === 'thinking')
  if (hasThinking) return 'Thinking'

  // Check for text content (reply)
  const hasText = blocks.some(b => b.type === 'text')
  if (hasText) return 'Reply'

  // System events
  if (entry.type === 'system') return 'System'

  return 'Input'
}

/**
 * Extract content summary based on document rules:
 * - text block → extract text field
 * - thinking block → extract thinking field
 * - tool_use block → extract tool name and input summary
 * - tool_result block → extract content
 */
export function extractContentSummary(entry: LogEntry): string {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []

  // Handle tool_result (return results)
  const toolResult = blocks.find(b => b.type === 'tool_result')
  if (toolResult) {
    const tr = toolResult as { content?: unknown; is_error?: boolean }
    if (tr.content !== undefined) {
      if (typeof tr.content === 'string') {
        return tr.content.slice(0, 200)
      }
      return JSON.stringify(tr.content).slice(0, 200)
    }
    return ''
  }

  // Handle tool_use (calls)
  const toolUse = blocks.find(b => b.type === 'tool_use')
  if (toolUse) {
    const tu = toolUse as { name?: string; input?: Record<string, unknown> }
    const name = tu.name || 'unknown'
    const input = tu.input || {}
    // Extract key input field based on tool type
    if (name === 'Bash') {
      const cmd = (input.command || input.script || '') as string
      return cmd.slice(0, 100)
    }
    if (name === 'Read' || name === 'Write' || name === 'Edit') {
      const path = (input.file_path || input.path) as string
      return path || ''
    }
    if (name === 'Glob') {
      const pattern = (input.pattern) as string
      return pattern || ''
    }
    if (name === 'WebFetch') {
      const url = (input.url) as string
      return url || ''
    }
    // For other tools, stringify the input
    const keys = Object.keys(input).slice(0, 3)
    const summary = keys.map(k => `${k}: ${input[k]}`).join(', ')
    return summary.slice(0, 100)
  }

  // Handle thinking
  const thinking = blocks.find(b => b.type === 'thinking')
  if (thinking) {
    const t = (thinking as { thinking?: string }).thinking || ''
    return t.slice(0, 150) + (t.length > 150 ? '...' : '')
  }

  // Handle text (reply)
  const text = blocks.find(b => b.type === 'text')
  if (text) {
    const t = (text as { text?: string }).text || ''
    return t.slice(0, 200)
  }

  // Fallback: return stringified entry
  return JSON.stringify(entry.message?.content || entry.type || '').slice(0, 100)
}

/**
 * Extract tool name from entry (if it's a tool call)
 */
export function extractToolName(entry: LogEntry): string | undefined {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []
  const toolUse = blocks.find(b => b.type === 'tool_use')
  if (toolUse) {
    return (toolUse as { name?: string }).name
  }
  return undefined
}

/**
 * Extract tool ID from entry (for correlation)
 */
export function extractToolId(entry: LogEntry): string | undefined {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []
  const toolUse = blocks.find(b => b.type === 'tool_use')
  if (toolUse) {
    return (toolUse as { id?: string }).id
  }
  return undefined
}

/**
 * Extract correlation ID (tool_use_id from tool_result)
 */
export function extractCorrelationId(entry: LogEntry): string | undefined {
  const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []
  const toolResult = blocks.find(b => b.type === 'tool_result')
  if (toolResult) {
    return (toolResult as { tool_use_id?: string }).tool_use_id
  }
  return undefined
}

/**
 * Parse a log entry and return structured entity info per document spec
 */
export function parseEntryToEntity(entry: LogEntry): ParsedEntityInfo {
  const entityType = classifyEntityType(entry)
  const actionType = classifyActionType(entry)
  const contentSummary = extractContentSummary(entry)
  const toolName = extractToolName(entry)
  const toolId = extractToolId(entry)
  const correlationId = extractCorrelationId(entry)

  return {
    entityType,
    actionType,
    contentSummary,
    toolName,
    toolId,
    correlationId,
  }
}

// ─── Layout constants ──────────────────────────────────────────────────────────

// Logical bounding-box sizes used by the layout engine (not the visual SVG sizes)
const SZ = {
  user:      { width: 92,  height: 108 },
  assistant: { width: 122, height: 162 },
  subagent:  { width: 116, height: 156 },
  llm:       { width: 108, height: 148 },
  tool:      { width: 222, height: 50  },
}

// Column left-edge X positions (compressed for shorter lines)
const COL = { user: 60, agent: 200, llm: 360, tool: 480 }

const V_PAD = 70
const H_PAD = 80
const SLOT_V_GAP = 52     // gap between agent "clusters"
const TOOL_ROW_GAP = 10   // gap between tool cards
const CONTEXT_WINDOW = 200_000

// ─── Tool helpers ───────────────────────────────────────────────────────────────

/**
 * Classify tool by exact name per document spec:
 * - Agent → SubAgent
 * - Bash → BashTool
 * - Read/Write/Replace/Glob → FileTool
 * - WebFetch/ToolSearch → NetworkTool
 * - mcp__* → MCPTool
 * - sql/database/* → DatabaseTool
 * - Otherwise → GenericTool
 */
export function classifyTool(name: string): NodeType {
  const n = name.toLowerCase()

  // Exact matches per document
  if (n === 'bash' || n === 'run' || n === 'execute_command' || n === 'exec') return 'tool-bash'
  if (n === 'read' || n === 'write' || n === 'replace' || n === 'edit' || n === 'glob') return 'tool-file'
  if (n === 'webfetch' || n === 'toolsearch' || n === 'websearch') return 'tool-network'
  if (n.startsWith('mcp__')) return 'tool-mcp'
  if (n === 'agent' || n === 'subagent' || n === 'spawn') return 'tool-task'

  // Database tools
  if (['sql', 'database', 'db', 'query', 'mongo', 'postgres', 'mysql', 'sqlite', 'redis'].some(k => n.includes(k))) return 'tool-database'

  // Additional file tools
  if (['view', 'delete', 'move', 'notebook', 'grep', 'file'].some(k => n.includes(k))) return 'tool-file'

  return 'tool-generic'
}

/**
 * Convert EntityType to NodeType for visualization
 */
export function entityTypeToNodeType(entity: EntityType, toolName?: string): NodeType {
  switch (entity) {
    case 'User': return 'user'
    case 'MainAgent': return 'assistant'
    case 'SubAgent': return 'subagent'
    case 'BashTool': return 'tool-bash'
    case 'FileTool': return 'tool-file'
    case 'NetworkTool': return 'tool-network'
    case 'MCPTool': return 'tool-mcp'
    case 'DatabaseTool': return 'tool-database'
    case 'GenericTool':
    case 'Unknown':
      return toolName ? classifyTool(toolName) : 'tool-generic'
    case 'SystemEnv':
    default:
      return 'tool-generic'
  }
}

export function getToolCategory(type: NodeType): string {
  const m: Partial<Record<NodeType, string>> = {
    'tool-bash': 'Terminal', 'tool-file': 'File System', 'tool-network': 'Network',
    'tool-mcp': 'MCP', 'tool-task': 'Task/Agent', 'tool-database': 'Database',
    'tool-generic': 'Tool',
  }
  return m[type] ?? 'Tool'
}

function extractToolContent(toolName: string, input: Record<string, unknown>): string {
  const n = toolName.toLowerCase()
  const s = (v: unknown, limit = 72) => String(v ?? '').slice(0, limit)

  if (n === 'bash' || n === 'run' || n === 'execute_command' || n === 'exec')
    return s(input.command ?? input.script ?? '')
  if (n === 'read') return s(input.file_path ?? input.path ?? '')
  if (n === 'write' || n === 'create') return s(input.file_path ?? input.path ?? '')
  if (n === 'edit' || n.includes('edit')) return s(input.file_path ?? input.path ?? '')
  if (n === 'glob') return s(input.pattern ?? '')
  if (n === 'grep') {
    const pat = s(input.pattern ?? input.query ?? '')
    const p = s(input.path ?? '')
    return p ? `${pat} in ${p}` : pat
  }
  if (n.includes('webfetch') || (n.includes('fetch') && !n.includes('webfetch'))) return s(input.url ?? '')
  if (n.includes('search')) return s(input.query ?? input.pattern ?? '')
  if (n.startsWith('mcp__')) {
    const first = Object.values(input).find(v => typeof v === 'string')
    return s(first ?? JSON.stringify(input))
  }
  const firstStr = Object.values(input).find(v => typeof v === 'string')
  return s(firstStr ?? Object.values(input)[0] ?? '')
}

function computeCost(inTok: number, outTok: number): number {
  return (inTok * PRICING.INPUT_PER_MTOK + outTok * PRICING.OUTPUT_PER_MTOK) / 1_000_000
}

// ─── Cluster layout ────────────────────────────────────────────────────────────

function computeLayout(
  userNode: FlowNode,
  agentNodes: FlowNode[],   // main-agent first
  llmNodes: FlowNode[],
  toolsByLlm: Map<string, FlowNode[]>,
): void {
  let curY = V_PAD

  agentNodes.forEach(agent => {
    const llmId = `llm-${agent.id}`
    const llm = llmNodes.find(l => l.id === llmId)
    const tools = llm ? (toolsByLlm.get(llmId) ?? []) : []

    const toolsH = tools.length > 0
      ? tools.length * SZ.tool.height + Math.max(0, tools.length - 1) * TOOL_ROW_GAP
      : 0

    const slotH = Math.max(agent.height, llm?.height ?? 0, toolsH) + 20

    // Center agent in slot
    agent.x = COL.agent
    agent.y = curY + Math.round((slotH - agent.height) / 2)

    // Center LLM in slot
    if (llm) {
      llm.x = COL.llm
      llm.y = curY + Math.round((slotH - llm.height) / 2)

      // Center tools in slot
      if (tools.length > 0) {
        const toolsStartY = curY + Math.round((slotH - toolsH) / 2)
        tools.forEach((t, i) => {
          t.x = COL.tool
          t.y = toolsStartY + i * (SZ.tool.height + TOOL_ROW_GAP)
          t.width = SZ.tool.width
          t.height = SZ.tool.height
        })
      }
    }

    curY += slotH + SLOT_V_GAP
  })

  // User: vertically centered over all agent slots
  const totalSpan = curY - SLOT_V_GAP - V_PAD
  userNode.x = COL.user
  userNode.y = V_PAD + Math.round((totalSpan - userNode.height) / 2)
}

// ─── Merge edges for full-view ─────────────────────────────────────────────────

function buildMergedEdges(edges: FlowEdge[]): MergedEdge[] {
  const m = new Map<string, MergedEdge>()
  edges.forEach(e => {
    const k = `${e.sourceId}||${e.targetId}||${e.isReturn}`
    if (!m.has(k)) {
      m.set(k, { id: k, sourceId: e.sourceId, targetId: e.targetId, isReturn: e.isReturn, isError: false, callCount: 0, errorCount: 0 })
    }
    const r = m.get(k)!
    r.callCount++
    if (e.isError) { r.errorCount++; r.isError = true }
  })
  return [...m.values()]
}

// ─── Main builder ──────────────────────────────────────────────────────────────

interface AgentStats {
  inputTokens: number
  outputTokens: number
  latestCtxTokens: number
  llmCalls: number
  model?: string
  thinking?: string
  response?: string
}

export function buildFlowGraph(data: ParsedLogData): FlowGraph {
  const nodeMap = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  let ec = 0
  let flowStep = 0

  const agentStats = new Map<string, AgentStats>()
  const toolsByLlm = new Map<string, FlowNode[]>()
  const pendingTools = new Map<string, { agentId: string; llmId: string; toolNodeId: string; toolName: string }>()

  const mkStats = (): AgentStats => ({
    inputTokens: 0, outputTokens: 0, latestCtxTokens: 0, llmCalls: 0,
  })

  // Bootstrap user + main-agent + main-llm
  nodeMap.set('user', {
    id: 'user', type: 'user', label: 'User', sublabel: 'Human Input',
    x: 0, y: 0, ...SZ.user, callCount: 0, errorCount: 0,
  })
  nodeMap.set('main-agent', {
    id: 'main-agent', type: 'assistant', label: 'Main Agent', sublabel: 'Claude',
    x: 0, y: 0, ...SZ.assistant, callCount: 0, errorCount: 0,
  })
  nodeMap.set('llm-main-agent', {
    id: 'llm-main-agent', type: 'llm', label: 'Claude', sublabel: 'LLM',
    x: 0, y: 0, ...SZ.llm, callCount: 0, errorCount: 0,
  })
  agentStats.set('main-agent', mkStats())
  toolsByLlm.set('llm-main-agent', [])

  // ── Process entries ──
  data.entries.forEach((entry, idx) => {
    const isSidechain = entry.isSidechain === true
    const saKey = entry.sourceToolAssistantUUID?.slice(-12)
    const agentId = isSidechain && saKey ? `sa-${saKey}` : 'main-agent'
    const llmId = `llm-${agentId}`

    // Create sub-agent + its LLM node on first sidechain entry
    if (isSidechain && saKey && !nodeMap.has(agentId)) {
      const num = [...nodeMap.values()].filter(n => n.type === 'subagent').length + 1
      nodeMap.set(agentId, {
        id: agentId, type: 'subagent',
        label: `Sub-Agent ${num}`,
        sublabel: entry.toolUseResult?.agentType ?? 'Agent',
        x: 0, y: 0, ...SZ.subagent, callCount: 0, errorCount: 0,
      })
      nodeMap.set(llmId, {
        id: llmId, type: 'llm', label: 'Claude', sublabel: 'LLM',
        x: 0, y: 0, ...SZ.llm, callCount: 0, errorCount: 0,
      })
      agentStats.set(agentId, mkStats())
      toolsByLlm.set(llmId, [])

      // Sub-agent → its LLM
      edges.push({ id: `e${ec++}`, sourceId: agentId, targetId: llmId, isError: false, isReturn: false, timestamp: entry.timestamp, entryIndex: idx, semantics: 'init' as EdgeSemantics, flowStep: flowStep++ })
      // Main LLM → sub-agent spawn
      edges.push({ id: `e${ec++}`, sourceId: 'llm-main-agent', targetId: agentId, isError: false, isReturn: false, timestamp: entry.timestamp, entryIndex: idx, toolName: 'Agent', semantics: 'agent_to_subagent' as EdgeSemantics, flowStep: flowStep++ })
    }

    // Ensure LLM tools bucket exists
    if (!toolsByLlm.has(llmId)) toolsByLlm.set(llmId, [])
    const stats = agentStats.get(agentId) ?? mkStats()
    if (!agentStats.has(agentId)) agentStats.set(agentId, stats)

    // User message → main agent
    if ((entry._category === 'USER_INPUT' || entry._category === 'USER_INPUT_WITH_IMAGE') && !isSidechain) {
      const userNode = nodeMap.get('user')!
      userNode.callCount++
      edges.push({ id: `e${ec++}`, sourceId: 'user', targetId: 'main-agent', isError: false, isReturn: false, timestamp: entry.timestamp, entryIndex: idx, semantics: 'user_to_agent' as EdgeSemantics, flowStep: flowStep++ })
    }

    // Assistant message (LLM call)
    const isLlmCall =
      entry._category === 'ASSISTANT_TEXT' ||
      entry._category === 'ASSISTANT_TOOL_CALL' ||
      entry._category === 'ASSISTANT_THINKING_RESPONSE'

    if (isLlmCall) {
      const llmNode = nodeMap.get(llmId)
      if (llmNode) llmNode.callCount++
      stats.llmCalls++

      if (entry.message) {
        const blocks = Array.isArray(entry.message.content) ? entry.message.content : []
        for (const b of blocks) {
          if (b.type === 'thinking') stats.thinking = ((b as Record<string, unknown>).thinking as string)?.slice(0, 300)
          else if (b.type === 'text') stats.response = ((b as Record<string, unknown>).text as string)?.slice(0, 300)
        }
        const usage = entry.message.usage
        if (usage) {
          const inT = usage.input_tokens ?? 0
          const outT = usage.output_tokens ?? 0
          stats.inputTokens += inT
          stats.outputTokens += outT
          stats.latestCtxTokens = Math.max(stats.latestCtxTokens, inT)
        }
        if (entry.message.model) stats.model = entry.message.model
      }
    }

    // Tool calls (from LLM response)
    if (entry._category === 'ASSISTANT_TOOL_CALL' && entry.message) {
      const blocks = Array.isArray(entry.message.content) ? entry.message.content : []
      blocks.forEach(item => {
        if (item.type !== 'tool_use') return
        const toolName = (item as Record<string, unknown>).name as string
        const toolId   = (item as Record<string, unknown>).id   as string
        const input    = ((item as Record<string, unknown>).input ?? {}) as Record<string, unknown>
        const toolNodeId = `tc-${toolId}`
        const toolType   = classifyTool(toolName)

        const toolNode: FlowNode = {
          id: toolNodeId,
          type: toolType,
          label: toolName,
          sublabel: getToolCategory(toolType),
          content: extractToolContent(toolName, input),
          x: 0, y: 0, width: SZ.tool.width, height: SZ.tool.height,
          callCount: 1, errorCount: 0,
        }
        nodeMap.set(toolNodeId, toolNode)
        toolsByLlm.get(llmId)!.push(toolNode)

        // LLM → Agent (LLM says "call tool"), then Agent → Tool (actual dispatch)
        edges.push({ id: `e${ec++}`, sourceId: llmId, targetId: agentId, isError: false, isReturn: false, timestamp: entry.timestamp, entryIndex: idx, toolName, semantics: 'llm_to_agent' as EdgeSemantics, flowStep: flowStep++ })
        edges.push({ id: `e${ec++}`, sourceId: agentId, targetId: toolNodeId, isError: false, isReturn: false, timestamp: entry.timestamp, entryIndex: idx, toolName, semantics: 'agent_to_llm' as EdgeSemantics, flowStep: flowStep++ })
        pendingTools.set(toolId, { agentId, llmId, toolNodeId, toolName })
      })
    }

    // Tool results → return edge
    if ((entry._category === 'TOOL_RESULT' || entry._category === 'TOOL_ERROR') && entry.message) {
      const blocks = Array.isArray(entry.message.content) ? entry.message.content : []
      blocks.forEach(item => {
        if (item.type !== 'tool_result') return
        const toolUseId = (item as Record<string, unknown>).tool_use_id as string
        const isErr     = !!(item as Record<string, unknown>).is_error
        const pending   = pendingTools.get(toolUseId)
        if (!pending) return

        const toolNode = nodeMap.get(pending.toolNodeId)
        if (toolNode && isErr) toolNode.errorCount++

        // Tool → Agent return, then Agent → LLM return
        edges.push({ id: `e${ec++}`, sourceId: pending.toolNodeId, targetId: pending.agentId, isError: isErr, isReturn: true, timestamp: entry.timestamp, entryIndex: idx, toolName: pending.toolName, semantics: 'tool_to_llm' as EdgeSemantics, flowStep: flowStep++ })
        edges.push({ id: `e${ec++}`, sourceId: pending.agentId, targetId: pending.llmId, isError: isErr, isReturn: true, timestamp: entry.timestamp, entryIndex: idx, toolName: pending.toolName, semantics: 'tool_to_llm' as EdgeSemantics, flowStep: flowStep++ })
        pendingTools.delete(toolUseId)
      })
    }

    // Sub-agent completion → return to main LLM
    if (entry.toolUseResult && !isSidechain && entry.sourceToolAssistantUUID) {
      const saId = `sa-${entry.sourceToolAssistantUUID.slice(-12)}`
      if (nodeMap.has(saId)) {
        edges.push({ id: `e${ec++}`, sourceId: saId, targetId: 'llm-main-agent', isError: entry.toolUseResult.status === 'error', isReturn: true, timestamp: entry.timestamp, entryIndex: idx, semantics: 'subagent_to_agent' as EdgeSemantics, flowStep: flowStep++ })
      }
    }
  })

  // ── Apply accumulated stats to nodes ──
  agentStats.forEach((stats, agentId) => {
    const agent = nodeMap.get(agentId)
    const llm   = nodeMap.get(`llm-${agentId}`)

    if (agent) {
      agent.inputTokens  = stats.inputTokens
      agent.outputTokens = stats.outputTokens
      agent.cost         = computeCost(stats.inputTokens, stats.outputTokens)
      agent.contextPct   = (stats.latestCtxTokens / CONTEXT_WINDOW) * 100
      agent.model        = stats.model
    }
    if (llm) {
      llm.inputTokens  = stats.inputTokens
      llm.outputTokens = stats.outputTokens
      llm.cost         = computeCost(stats.inputTokens, stats.outputTokens)
      llm.contextPct   = (stats.latestCtxTokens / CONTEXT_WINDOW) * 100
      llm.model        = stats.model
      llm.llmCalls     = stats.llmCalls
      llm.thinking     = stats.thinking
      llm.responseText = stats.response
      if (stats.model) {
        llm.sublabel = stats.model.replace(/^claude-/i, '').slice(0, 24)
      }
    }
  })

  // ── Add Agent → LLM init edges (before all other events) ──
  nodeMap.forEach((node, id) => {
    if ((node.type === 'assistant' || node.type === 'subagent') && nodeMap.has(`llm-${id}`)) {
      const llm = nodeMap.get(`llm-${id}`)!
      if (llm.callCount > 0) {
        edges.unshift({
          id: `einit-${id}`,
          sourceId: id, targetId: `llm-${id}`,
          isError: false, isReturn: false,
          timestamp: data.entries[0]?.timestamp ?? '',
          entryIndex: -1,
          semantics: 'init' as EdgeSemantics,
          flowStep: -1, // init edges have negative flowStep
        })
      }
    }
  })

  // ── Remove orphan LLM nodes (no calls made) ──
  nodeMap.forEach((node, id) => {
    if (node.type === 'llm' && node.callCount === 0) nodeMap.delete(id)
  })

  // ── Layout ──
  const allNodes = [...nodeMap.values()]
  const agentNodes = [
    nodeMap.get('main-agent')!,
    ...allNodes.filter(n => n.type === 'subagent'),
  ].filter(Boolean)
  const llmNodes = allNodes.filter(n => n.type === 'llm')

  computeLayout(nodeMap.get('user')!, agentNodes, llmNodes, toolsByLlm)

  const canvasWidth  = Math.max(...allNodes.map(n => n.x + n.width))  + H_PAD
  const canvasHeight = Math.max(...allNodes.map(n => n.y + n.height)) + V_PAD

  return {
    nodes: allNodes,
    edges,
    mergedEdges: buildMergedEdges(edges),
    canvasWidth,
    canvasHeight,
  }
}
