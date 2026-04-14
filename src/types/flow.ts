// ─── Entity & Action Types (per document spec) ───────────────────────────────────

// More granular entity types matching the parsing document
export type EntityType =
  | 'User'              // Human user input
  | 'MainAgent'         // Main Claude Agent (orchestrator)
  | 'SubAgent'          // Sub-agent spawned by main agent
  | 'BashTool'          // Terminal command tool
  | 'FileTool'          // File operations (Read/Write/Edit/Glob)
  | 'NetworkTool'       // WebFetch/ToolSearch
  | 'MCPTool'           // External MCP tools
  | 'DatabaseTool'      // SQL/Database tools
  | 'GenericTool'       // Unknown tools
  | 'SystemEnv'         // System environment (metadata)
  | 'Unknown'           // Unclassified

// Action types for structured output
export type ActionType =
  | 'Input'            // User text input
  | 'Thinking'         // Agent internal reasoning
  | 'Reply'            // Agent final response to user
  | 'ToolCall'         // Agent invokes a tool/subagent
  | 'ToolResult'       // Tool/subagent returns result
  | 'System'           // System event

// Legacy NodeType for backward compatibility with visualization
export type NodeType =
  | 'user'
  | 'assistant'
  | 'llm'
  | 'subagent'
  | 'tool-bash'
  | 'tool-file'
  | 'tool-network'
  | 'tool-mcp'
  | 'tool-task'
  | 'tool-database'
  | 'tool-generic'

export type EdgeSemantics =
  | 'user_to_agent'      // 用户输入 → 主agent
  | 'agent_to_llm'       // agent → LLM (分发)
  | 'llm_to_tool'         // LLM → 工具调用
  | 'tool_to_llm'         // 工具 → LLM (结果返回)
  | 'llm_to_agent'        // LLM → agent (响应)
  | 'agent_to_user'       // agent → 用户 (最终结果)
  | 'agent_to_subagent'   // agent → 子agent (派生)
  | 'subagent_to_agent'   // 子agent → agent (结果返回)
  | 'init'                // 初始化边

export interface FlowNode {
  id: string
  type: NodeType
  label: string
  sublabel?: string
  x: number
  y: number
  width: number
  height: number
  callCount: number
  errorCount: number
  // Tool nodes
  content?: string              // command / file path / query
  // Agent / LLM nodes
  cost?: number                 // USD cost
  inputTokens?: number
  outputTokens?: number
  contextPct?: number           // 0-100 context window usage
  model?: string
  llmCalls?: number
  thinking?: string             // last thinking block (truncated)
  responseText?: string         // last assistant text (truncated)
  // Enhanced fields for semantic flow
  agentRole?: 'orchestrator' | 'sub-agent' | 'user'  // agent role designation
  contentType?: string          // content.type (e.g. 'tool_use', 'text', 'thinking')
  contentName?: string          // content.name (e.g. 'bash', 'mcp__chrome-devtools__click')
  // New fields per document spec
  entityType?: EntityType       // Granular entity type
  actionType?: ActionType       // Action type
  correlationId?: string        // tool_use_id for matching call/result
  parentId?: string            // parentUuid for tree structure
  contentSummary?: string       // Extracted text/thinking/result summary
}

export interface FlowEdge {
  id: string
  sourceId: string
  targetId: string
  isError: boolean
  isReturn: boolean
  timestamp: string
  entryIndex: number
  toolName?: string
  // Semantic edge type for focused animation
  semantics?: EdgeSemantics
  // Flow step number for sequencing
  flowStep?: number
  // New fields per document spec
  actionType?: ActionType
  correlationId?: string  // tool_use_id for matching call/result
}

export interface MergedEdge {
  id: string
  sourceId: string
  targetId: string
  isReturn: boolean
  isError: boolean
  callCount: number
  errorCount: number
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
  mergedEdges: MergedEdge[]
  canvasWidth: number
  canvasHeight: number
}
