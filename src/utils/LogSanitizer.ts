/**
 * LogSanitizer - 数据清洗与解析
 *
 * 将原始 .jsonl 日志转换为包含 parentId 的扁平化树状事件数组
 * 过滤噪音事件，保留核心节点事件
 */

import type { SanitizedEvent, CoreEventType } from '../types/agentFlow'
import type { ParsedLogData } from '../types/log'
import type { LogEntry } from '../types/log'

// ─── 噪音事件类型 (必须忽略) ───────────────────────────────────────────────────

const NOISE_PATTERNS = [
  'request_sent',
  'connection_retry',
  'connection_close',
  'text_delta',
  'content_block_delta',
  'heartbeat',
  'system_prompt',
  'metadata',
  'ping',
  'pong',
]

/**
 * 判断是否为噪音事件
 */
function isNoiseEvent(entry: LogEntry): boolean {
  const type = entry.type?.toLowerCase() ?? ''
  const msgRole = entry.message?.role?.toLowerCase() ?? ''

  // 检查类型匹配噪音模式
  for (const pattern of NOISE_PATTERNS) {
    if (type.includes(pattern) || msgRole.includes(pattern)) {
      return true
    }
  }

  // 检查是否是细粒度文本流
  const cat = entry._category
  if (cat === 'ASSISTANT_TEXT') {
    return true
  }

  return false
}

/**
 * 从 entry 中提取 tool_call 信息
 */
function extractToolCall(entry: LogEntry): { name?: string; input?: Record<string, unknown>; id?: string } | null {
  if (!entry.message?.content) return null

  const blocks = Array.isArray(entry.message.content)
    ? entry.message.content
    : []

  const toolUse = blocks.find((b: any) => b.type === 'tool_use') as any
  if (!toolUse) return null

  return {
    name: toolUse.name,
    input: toolUse.input,
    id: toolUse.id,
  }
}

/**
 * 从 entry 中提取 tool_result 信息
 */
function extractToolResult(entry: LogEntry): { tool_use_id?: string; content?: unknown; is_error?: boolean } | null {
  if (!entry.message?.content) return null

  const blocks = Array.isArray(entry.message.content)
    ? entry.message.content
    : []

  const toolResult = blocks.find((b: any) => b.type === 'tool_result') as any
  if (!toolResult) return null

  return {
    tool_use_id: toolResult.tool_use_id,
    content: toolResult.content,
    is_error: toolResult.is_error,
  }
}

/**
 * 判断事件类型
 */
function classifyEventType(entry: LogEntry, toolCall: ReturnType<typeof extractToolCall>, toolResult: ReturnType<typeof extractToolResult>): CoreEventType | null {
  const category = entry._category
  const entryType = entry.type

  // user_message 触发 Orchestrator
  if (category === 'USER_INPUT' || category === 'USER_INPUT_WITH_IMAGE') {
    return 'user_message'
  }

  // agent_thinking_start / step_start
  if (category === 'ASSISTANT_THINKING_RESPONSE') {
    return 'agent_thinking_start'
  }

  // step_start - use entry.type for custom type strings
  if (entryType === 'STEP_START') {
    return 'step_start'
  }

  // tool_call
  if (toolCall) {
    return 'tool_call'
  }

  // tool_result / error
  if (toolResult) {
    return toolResult.is_error ? 'error' : 'tool_result'
  }

  // agent_message_complete - use entry.type for custom type strings
  if (entryType === 'AGENT_MESSAGE_COMPLETE' || entryType === 'MESSAGE_COMPLETE') {
    return 'agent_message_complete'
  }

  return null
}

/**
 * 主清洗函数
 * 将 ParsedLogData 转换为 SanitizedEvent 数组
 */
export function sanitizeLog(data: ParsedLogData): SanitizedEvent[] {
  const events: SanitizedEvent[] = []
  const nodeIdMap = new Map<string, string>() // tool_use_id -> nodeId
  let nodeIdCounter = 0
  const pendingToolCalls = new Map<string, { parentId: string; toolName?: string; input?: string }>()

  // Debug: log entry categories
  const categoryCount: Record<string, number> = {}
  for (const entry of data.entries) {
    const cat = entry._category || 'NO_CATEGORY'
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  }
  console.log('[LogSanitizer] Entry categories:', JSON.stringify(categoryCount))
  console.log('[LogSanitizer] Total entries:', data.entries.length)

  // 创建根节点 (Orchestrator)
  const rootId = 'orchestrator-0'
  events.push({
    id: `event-${nodeIdCounter++}`,
    type: 'user_message',
    timestamp: data.entries[0]?.timestamp ? new Date(data.entries[0].timestamp).getTime() : Date.now(),
    parentId: null,
    nodeId: rootId,
  })

  let currentParentId = rootId

  for (const entry of data.entries) {
    // 跳过噪音事件
    if (isNoiseEvent(entry)) {
      // 但如果侧边栏需要，可以在另一个数组中保留文本流
      continue
    }

    const toolCall = extractToolCall(entry)
    const toolResult = extractToolResult(entry)
    const eventType = classifyEventType(entry, toolCall, toolResult)

    if (!eventType) continue

    switch (eventType) {
      case 'user_message': {
        // 用户消息 → 触发新的 Orchestrator
        const orchestratorId = `orchestrator-${nodeIdCounter++}`
        events.push({
          id: `event-${nodeIdCounter++}`,
          type: eventType,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          parentId: null,
          nodeId: orchestratorId,
        })
        currentParentId = orchestratorId
        break
      }

      case 'agent_thinking_start':
      case 'step_start': {
        // 思考/步骤开始 → 创建新的 thinking 节点
        const blocks = Array.isArray(entry.message?.content) ? entry.message.content : []
        const thinking = blocks.find((b: any) => b.type === 'thinking') as any

        const thinkingNodeId = `thinking-${nodeIdCounter++}`

        events.push({
          id: `event-${nodeIdCounter++}`,
          type: eventType,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          parentId: currentParentId,
          nodeId: thinkingNodeId,
          thinking: thinking?.thinking?.slice(0, 500),
        })
        break
      }

      case 'tool_call': {
        // 工具调用 → 创建新的子节点
        if (!toolCall?.id || !toolCall?.name) break

        const toolNodeId = `tool-${toolCall.id}`
        nodeIdMap.set(toolCall.id, toolNodeId)

        // 保存待处理的 tool_call 以便在 tool_result 时关联
        pendingToolCalls.set(toolCall.id, {
          parentId: currentParentId,
          toolName: toolCall.name,
          input: toolCall.input ? JSON.stringify(toolCall.input).slice(0, 200) : undefined,
        })

        // 提取关键输入信息
        let toolInput = ''
        if (toolCall.input) {
          const input = toolCall.input as Record<string, unknown>
          if (input.command) toolInput = String(input.command).slice(0, 100)
          else if (input.file_path) toolInput = String(input.file_path)
          else if (input.url) toolInput = String(input.url)
          else toolInput = Object.values(input).slice(0, 2).join(', ').slice(0, 100)
        }

        events.push({
          id: `event-${nodeIdCounter++}`,
          type: eventType,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          parentId: currentParentId,
          nodeId: toolNodeId,
          toolName: toolCall.name,
          toolInput,
        })
        break
      }

      case 'tool_result':
      case 'error': {
        // 工具结果/错误 → 关联到对应的 tool_call
        if (!toolResult?.tool_use_id) break

        const pending = pendingToolCalls.get(toolResult.tool_use_id)
        const toolNodeId = nodeIdMap.get(toolResult.tool_use_id)

        if (!toolNodeId) break

        // 提取输出内容
        let toolOutput = ''
        if (toolResult.content !== undefined) {
          if (typeof toolResult.content === 'string') {
            toolOutput = toolResult.content.slice(0, 300)
          } else if (Array.isArray(toolResult.content)) {
            toolOutput = toolResult.content.map(c => typeof c === 'string' ? c : JSON.stringify(c)).join('\n').slice(0, 300)
          }
        }

        events.push({
          id: `event-${nodeIdCounter++}`,
          type: eventType,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          parentId: pending?.parentId ?? currentParentId,
          nodeId: toolNodeId,
          toolName: pending?.toolName,
          toolInput: pending?.input,
          toolOutput,
          isError: eventType === 'error',
        })

        pendingToolCalls.delete(toolResult.tool_use_id)
        break
      }

      case 'agent_message_complete': {
        // 闭环 → 回到 Orchestrator
        events.push({
          id: `event-${nodeIdCounter++}`,
          type: eventType,
          timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now(),
          parentId: null,
          nodeId: currentParentId,
        })
        break
      }
    }
  }

  // Debug: log how many events were created
  const eventTypeCount: Record<string, number> = {}
  for (const e of events) {
    eventTypeCount[e.type] = (eventTypeCount[e.type] || 0) + 1
  }
  console.log('[LogSanitizer] Created events:', events.length, 'types:', JSON.stringify(eventTypeCount))

  return events
}

/**
 * 根据 SanitizedEvent 数组构建树状结构
 */
export function buildEventTree(events: SanitizedEvent[]): Map<string | null, SanitizedEvent[]> {
  const tree = new Map<string | null, SanitizedEvent[]>()

  for (const event of events) {
    const children = tree.get(event.parentId) ?? []
    children.push(event)
    tree.set(event.parentId, children)
  }

  return tree
}
