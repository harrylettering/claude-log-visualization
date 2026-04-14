/**
 * CallGraphBuilder - TypeScript implementation
 *
 * Converts Python build_call_graph.py to TypeScript.
 * Builds call chain via uuid/parentUuid tree structure.
 */

import type { LogEntry } from '../../../types/log'
import type {
  VirtualNode,
  EntityNode,
  CallLink,
  Layer,
  CallGraph,
  SimulationEvent,
  NodeType,
  LinkType,
  ContentType,
  Particle,
} from '../../../types/agentCanvas'

// ─── Enums ─────────────────────────────────────────────────────────────────────

enum Role {
  ASSISTANT = 'assistant',
  USER = 'user',
  SYSTEM = 'system',
}

// ─── Entity ID Constants ───────────────────────────────────────────────────────

const ENTITY_ID = {
  USER: '0',
  MAIN_AGENT: '1',
  ASSISTANT: '2',
} as const

// ─── Helper Functions ───────────────────────────────────────────────────────────

function getEntityId(role: Role, contentType: ContentType, item?: Record<string, unknown>): string {
  if (role === Role.USER && contentType === 'tool_result') {
    // Tool result: use tool_use_id
    return item?.tool_use_id as string || `tool_${Date.now()}`
  }
  if (role === Role.ASSISTANT && contentType === 'tool_use') {
    // Tool call: use id from item
    return item?.id as string || `tool_${Date.now()}`
  }
  if (role === Role.USER) return ENTITY_ID.USER
  if (role === Role.ASSISTANT) return ENTITY_ID.ASSISTANT
  return ENTITY_ID.MAIN_AGENT
}

function getEntityType(role: Role, contentType: ContentType): NodeType {
  if (role === Role.USER && contentType === 'tool_result') return 'tool'
  if (role === Role.ASSISTANT && contentType === 'tool_use') return 'tool'
  if (role === Role.USER) return 'user'
  if (role === Role.ASSISTANT) return 'assistant'
  return 'main_agent'
}

function getDisplayName(entityType: NodeType, toolName?: string): string {
  switch (entityType) {
    case 'user': return 'User'
    case 'main_agent': return 'Main Agent'
    case 'assistant': return 'Assistant'
    case 'tool': return toolName ? `Tool: ${toolName}` : 'Tool'
    default: return 'Unknown'
  }
}

function parseContentType(item: Record<string, unknown>): ContentType {
  const type = item.type as string
  switch (type) {
    case 'text': return 'text'
    case 'thinking': return 'thinking'
    case 'tool_use': return 'tool_use'
    case 'tool_result': return 'tool_result'
    case 'image': return 'image'
    default: return 'text'
  }
}

function parseRole(entry: LogEntry): Role {
  if (entry.type === 'user') return Role.USER
  if (entry.type === 'assistant') return Role.ASSISTANT
  if (entry.type === 'system') return Role.SYSTEM

  const msgRole = entry.message?.role
  if (msgRole === 'user') return Role.USER
  if (msgRole === 'assistant') return Role.ASSISTANT
  return Role.SYSTEM
}

// ─── CallGraphBuilder Class ─────────────────────────────────────────────────────

export class CallGraphBuilder {
  private virtualNodes: Map<string, VirtualNode> = new Map()
  private layers: Layer[] = []
  private callLinks: CallLink[] = []
  private entityNodes: Map<string, EntityNode> = new Map()

  /**
   * Build call graph from log entries
   */
  buildCallGraph(entries: LogEntry[]): SimulationEvent[] {
    this.buildNodes(entries)
    this.buildLayers()
    this.buildChains()
    return this.generateEvents()
  }

  /**
   * Build virtual nodes from entries
   */
  private buildNodes(entries: LogEntry[]): void {
    for (const entry of entries) {
      const message = entry.message
      const content = message?.content

      if (!Array.isArray(content)) continue

      const role = parseRole(entry)

      for (const item of content) {
        if (typeof item !== 'object' || item === null) continue

        const contentType = parseContentType(item as Record<string, unknown>)
        const toolName = contentType === 'tool_use' ? (item as Record<string, unknown>).name as string : undefined

        // Create SubNode for each entity
        const entityId = getEntityId(role, contentType, item as Record<string, unknown>)
        const entityType = getEntityType(role, contentType)
        const displayName = getDisplayName(entityType, toolName)

        const subNode: EntityNode = {
          entityType,
          entityId,
          displayName,
          x: 0,
          y: 0,
          opacity: 0,
          scale: 1,
          state: 'idle',
        }
        this.entityNodes.set(entityId, subNode)

        // Create VirtualNode (this is the Python Node equivalent)
        const virtualNode: VirtualNode = {
          uuid: entry.uuid || `uuid_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          role,
          contentType,
          toolName,
          parentUuid: entry.parentUuid || null,
          children: [],
          callLinks: [],
        }

        // Build call links based on content type and role
        const links = this.buildCallLinks(role, contentType, item as Record<string, unknown>)
        virtualNode.callLinks = links
        virtualNode.children = links.map(l => l.target)

        this.virtualNodes.set(virtualNode.uuid, virtualNode)
      }
    }
  }

  /**
   * Build call links for a node
   */
  private buildCallLinks(
    role: Role,
    contentType: ContentType,
    item: Record<string, unknown>
  ): CallLink[] {
    const links: CallLink[] = []

    switch (role) {
      case Role.ASSISTANT:
        if (contentType === 'thinking') {
          // Self-loop: assistant thinking
          links.push(this.createLink('thinking', ENTITY_ID.ASSISTANT, ENTITY_ID.ASSISTANT))
        } else if (contentType === 'tool_use') {
          // assistant -> main_agent (agent_call)
          // main_agent -> tool (tool_call)
          const toolId = item.id as string
          links.push(this.createLink('agent_call', ENTITY_ID.ASSISTANT, ENTITY_ID.MAIN_AGENT))
          links.push(this.createLink('tool_call', ENTITY_ID.MAIN_AGENT, toolId))
        } else if (contentType === 'text') {
          // assistant -> main_agent (agent_response)
          // main_agent -> user (response)
          links.push(this.createLink('agent_response', ENTITY_ID.ASSISTANT, ENTITY_ID.MAIN_AGENT))
          links.push(this.createLink('response', ENTITY_ID.MAIN_AGENT, ENTITY_ID.USER))
        }
        break

      case Role.USER:
        if (contentType === 'tool_result') {
          // tool -> main_agent (tool_result)
          // main_agent -> assistant (agent_result)
          const toolUseId = item.tool_use_id as string
          links.push(this.createLink('tool_result', toolUseId, ENTITY_ID.MAIN_AGENT))
          links.push(this.createLink('agent_result', ENTITY_ID.MAIN_AGENT, ENTITY_ID.ASSISTANT))
        } else if (contentType === 'text' || contentType === 'image') {
          // user -> main_agent (user_input)
          // main_agent -> assistant (agent_receive)
          links.push(this.createLink('user_input', ENTITY_ID.USER, ENTITY_ID.MAIN_AGENT))
          links.push(this.createLink('agent_receive', ENTITY_ID.MAIN_AGENT, ENTITY_ID.ASSISTANT))
        }
        break
    }

    return links
  }

  private createLink(linkType: LinkType, source: string, target: string): CallLink {
    return {
      id: `${source}-${target}`,
      source,
      target,
      linkType,
      opacity: 1,
    }
  }

  /**
   * Build layers by breadth-first traversal of parentUuid tree
   */
  private buildLayers(): void {
    this.layers = []

    // Find root nodes (nodes without parentUuid or parent not in virtualNodes)
    const rootNodes: VirtualNode[] = []
    const childNodes: VirtualNode[] = []

    for (const node of this.virtualNodes.values()) {
      if (!node.parentUuid || !this.virtualNodes.has(node.parentUuid)) {
        rootNodes.push(node)
      } else {
        childNodes.push(node)
      }
    }

    if (rootNodes.length === 0 && childNodes.length > 0) {
      // If no root found, treat first node as root
      rootNodes.push(childNodes.shift()!)
    }

    // Layer 0: root nodes
    this.layers.push({ level: 0, nodes: [...rootNodes] })
    const processed = new Set<string>(rootNodes.map(n => n.uuid))

    // Build subsequent layers
    let currentLevelNodes = rootNodes
    let level = 1

    while (true) {
      const nextLevelNodes: VirtualNode[] = []
      const currentParentUuids = new Set<string>(currentLevelNodes.map(n => n.uuid))

      for (const node of childNodes) {
        if (!processed.has(node.uuid) && node.parentUuid && currentParentUuids.has(node.parentUuid)) {
          nextLevelNodes.push(node)
          processed.add(node.uuid)
        }
      }

      if (nextLevelNodes.length === 0) break

      this.layers.push({ level, nodes: nextLevelNodes })
      currentLevelNodes = nextLevelNodes
      level++
    }

    // Add any remaining unprocessed nodes as new layers
    for (const node of childNodes) {
      if (!processed.has(node.uuid)) {
        this.layers.push({ level: level, nodes: [node] })
        processed.add(node.uuid)
        level++
      }
    }
  }

  /**
   * Build call chains from layers
   */
  private buildChains(): void {
    this.callLinks = []

    for (const node of this.virtualNodes.values()) {
      for (const link of node.callLinks) {
        // Avoid duplicates
        if (!this.callLinks.some(l => l.id === link.id)) {
          this.callLinks.push(link)
        }
      }
    }
  }

  /**
   * Generate simulation events from call graph
   */
  private generateEvents(): SimulationEvent[] {
    const events: SimulationEvent[] = []
    let time = 0
    const timeIncrement = 0.5 // seconds between events

    // Sort call links by some ordering (could be by layer, or just as they come)
    const sortedLinks = [...this.callLinks].sort((a, b) => {
      // Sort by source entity type priority: user > main_agent > assistant > tool
      const priority = (id: string) => {
        if (id === ENTITY_ID.USER) return 0
        if (id === ENTITY_ID.MAIN_AGENT) return 1
        if (id === ENTITY_ID.ASSISTANT) return 2
        return 3
      }
      return priority(a.source) - priority(b.source)
    })

    for (const link of sortedLinks) {
      const sourceNode = this.entityNodes.get(link.source)
      const targetNode = this.entityNodes.get(link.target)

      // Node spawn events
      if (sourceNode && !events.some(e => e.payload.nodeId === link.source)) {
        events.push({
          time,
          type: 'node_spawn',
          payload: {
            nodeId: link.source,
            nodeType: sourceNode.entityType,
            displayName: sourceNode.displayName,
          },
        })
      }

      if (targetNode && !events.some(e => e.payload.nodeId === link.target)) {
        events.push({
          time,
          type: 'node_spawn',
          payload: {
            nodeId: link.target,
            nodeType: targetNode.entityType,
            displayName: targetNode.displayName,
          },
        })
      }

      // Edge create event
      events.push({
        time,
        type: 'edge_create',
        payload: {
          edgeId: link.id,
          source: link.source,
          target: link.target,
          linkType: link.linkType,
        },
      })

      // Particle dispatch event
      const particleType = this.getParticleType(link.linkType)
      const particleColor = this.getParticleColor(link.linkType)

      events.push({
        time,
        type: 'particle_dispatch',
        payload: {
          particle: {
            id: `p-${time}-${link.source}-${link.target}`,
            edgeId: link.id,
            progress: 0,
            type: particleType,
            color: particleColor,
            size: 4,
            trailLength: 0.15,
          } as Particle,
        },
      })

      time += timeIncrement
    }

    return events
  }

  private getParticleType(linkType: LinkType): Particle['type'] {
    switch (linkType) {
      case 'tool_call': return 'tool_call'
      case 'tool_result': return 'tool_return'
      case 'thinking': return 'thinking'
      case 'user_input':
      case 'agent_call':
      case 'agent_receive':
      case 'agent_response': return 'dispatch'
      case 'agent_result':
      case 'response': return 'return'
      default: return 'dispatch'
    }
  }

  private getParticleColor(linkType: LinkType): string {
    switch (linkType) {
      case 'tool_call': return '#ffbb44'
      case 'tool_result': return '#ff8866'
      case 'thinking': return '#a855f7'
      case 'user_input': return '#88ff88'
      case 'agent_call':
      case 'agent_receive': return '#cc88ff'
      case 'agent_response':
      case 'agent_result': return '#66ffaa'
      case 'response': return '#66ccff'
      default: return '#66ccff'
    }
  }

  /**
   * Get the built call graph
   */
  getCallGraph(): CallGraph {
    return {
      virtualNodes: this.virtualNodes,
      layers: this.layers,
      subNodes: this.entityNodes,
      callLinks: this.callLinks,
    }
  }

  /**
   * Get entity nodes
   */
  getEntityNodes(): Map<string, EntityNode> {
    return this.entityNodes
  }

  /**
   * Get call links
   */
  getCallLinks(): CallLink[] {
    return this.callLinks
  }

  /**
   * Get layers
   */
  getLayers(): Layer[] {
    return this.layers
  }

  /**
   * Initialize positions for entity nodes based on layers
   * This is a simple layout - findToolSlot will be used for tool positioning
   */
  initializePositions(
    _canvasWidth: number,
    _canvasHeight: number,
    mainAgentX: number,
    mainAgentY: number
  ): void {
    // Ensure main agent node exists (create default if missing)
    let mainAgentNode = this.entityNodes.get(ENTITY_ID.MAIN_AGENT)
    if (!mainAgentNode) {
      mainAgentNode = {
        entityType: 'main_agent',
        entityId: ENTITY_ID.MAIN_AGENT,
        displayName: 'Main Agent',
        x: mainAgentX,
        y: mainAgentY,
        opacity: 0,
        scale: 1,
        state: 'idle',
      }
      this.entityNodes.set(ENTITY_ID.MAIN_AGENT, mainAgentNode)
    }

    // Default positions for main entities
    const userNode = this.entityNodes.get(ENTITY_ID.USER)
    const assistantNode = this.entityNodes.get(ENTITY_ID.ASSISTANT)

    if (userNode) {
      userNode.x = mainAgentX - 200
      userNode.y = mainAgentY
    }

    mainAgentNode.x = mainAgentX
    mainAgentNode.y = mainAgentY

    if (assistantNode) {
      assistantNode.x = mainAgentX + 200
      assistantNode.y = mainAgentY
    }

    // Tool nodes will be positioned by findToolSlot
  }
}

// ─── Layout Helper: findToolSlot ─────────────────────────────────────────────────

export interface PositionedNode {
  entityId: string
  x: number
  y: number
  parentId: string | null
}

const TOOL_SLOT = {
  baseDistance: 120,
  ringIncrement: 60,
  baseSteps: 8,
  stepsPerRing: 4,
  maxRings: 3,
  fallbackDistance: 300,
}

const TOOL_CARD_W = 200
const TOOL_CARD_H = 50

/**
 * Find a slot for a new tool node near the agent
 * Uses concentric circle search in the exit direction扇形区域
 */
export function findToolSlot(
  agent: PositionedNode,
  existingNodes: Map<string, PositionedNode>,
  existingTools: Map<string, PositionedNode>,
  parentId?: string | null
): { x: number; y: number } {
  // Calculate exit direction
  let outAngle = -Math.PI / 2 // Default: upward
  if (parentId) {
    const parent = existingNodes.get(parentId)
    if (parent) {
      outAngle = Math.atan2(agent.y - parent.y, agent.x - parent.x)
    }
  }

  // Check for overlaps with bubble rect or existing tools
  const overlaps = (cx: number, cy: number): boolean => {
    // Check against existing tools
    for (const tool of existingTools.values()) {
      if (Math.abs(cx - tool.x) < TOOL_CARD_W && Math.abs(cy - tool.y) < TOOL_CARD_H) {
        return true
      }
    }
    // Check against other existing nodes (but not the agent itself)
    for (const [id, node] of existingNodes) {
      if (id === agent.entityId) continue
      if (Math.abs(cx - node.x) < 80 && Math.abs(cy - node.y) < 80) {
        return true
      }
    }
    return false
  }

  // Search in concentric circles
  for (let ring = 1; ring <= TOOL_SLOT.maxRings; ring++) {
    const dist = TOOL_SLOT.baseDistance + ring * TOOL_SLOT.ringIncrement
    const steps = TOOL_SLOT.baseSteps + ring * TOOL_SLOT.stepsPerRing

    for (let i = 0; i < steps; i++) {
      // Sweep in a扇形 pattern centered on outAngle
      const sweep = (i / (steps - 1) - 0.5) * Math.PI
      const angle = outAngle + sweep
      const cx = agent.x + Math.cos(angle) * dist
      const cy = agent.y + Math.sin(angle) * dist

      if (!overlaps(cx, cy)) {
        return { x: cx, y: cy }
      }
    }
  }

  // Fallback: return position at fallbackDistance in exit direction
  return {
    x: agent.x + Math.cos(outAngle) * TOOL_SLOT.fallbackDistance,
    y: agent.y + Math.sin(outAngle) * TOOL_SLOT.fallbackDistance,
  }
}
