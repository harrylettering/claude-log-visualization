/**
 * Activity sidebar with auto-scrolling log.
 */

import { useState, useEffect, useRef } from 'react'
import { Terminal, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

interface LogEntry {
  id: string
  type: 'command' | 'file' | 'complete' | 'error' | 'thinking'
  text: string
  timestamp: number
  agentName?: string
}

interface SidebarProps {
  maxHeight?: string
}

// Typewriter state cycler
const AGENT_STATES = [
  'Deliberating...',
  'Vibing...',
  'Working...',
  'Philosophising...',
  'Processing...',
  'Analyzing...',
]

export function ActivitySidebar({ maxHeight = 'calc(100vh - 300px)' }: SidebarProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stateIndex, setStateIndex] = useState(0)
  const [displayedState, setDisplayedState] = useState('')
  const [dotCount, setDotCount] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Simulate log entries over time
  useEffect(() => {
    const mockLogs: LogEntry[] = [
      { id: '1', type: 'thinking', text: 'Analyzing codebase structure...', timestamp: 0, agentName: 'Orchestrator' },
      { id: '2', type: 'command', text: 'find . -name "*.ts" | head -20', timestamp: 1.5, agentName: 'Bash' },
      { id: '3', type: 'file', text: 'Read: src/App.tsx (245 lines)', timestamp: 2.5, agentName: 'Code Analyzer' },
      { id: '4', type: 'complete', text: 'Analysis complete', timestamp: 3.5, agentName: 'Code Analyzer' },
      { id: '5', type: 'thinking', text: 'Applying changes to component...', timestamp: 4.0, agentName: 'File Writer' },
      { id: '6', type: 'command', text: 'Edit: src/components/AgentFlowView.tsx', timestamp: 4.2, agentName: 'Edit' },
      { id: '7', type: 'complete', text: 'Changes applied successfully', timestamp: 5.0, agentName: 'File Writer' },
    ]

    mockLogs.forEach((log, i) => {
      setTimeout(() => {
        setLogs(prev => [...prev, log])
      }, i * 800)
    })
  }, [])

  // Typewriter effect for agent state
  useEffect(() => {
    const interval = setInterval(() => {
      setStateIndex(prev => (prev + 1) % AGENT_STATES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fullState = AGENT_STATES[stateIndex]
    let charIndex = 0
    setDisplayedState('')
    setDotCount(0)

    const typeInterval = setInterval(() => {
      if (charIndex <= fullState.length) {
        setDisplayedState(fullState.slice(0, charIndex))
        charIndex++
      }
    }, 50)

    const dotInterval = setInterval(() => {
      setDotCount(prev => (prev + 1) % 4)
    }, 400)

    return () => {
      clearInterval(typeInterval)
      clearInterval(dotInterval)
    }
  }, [stateIndex])

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const getIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'command':
        return <Terminal className="w-3 h-3 text-amber-400" />
      case 'file':
        return <FileText className="w-3 h-3 text-cyan-400" />
      case 'complete':
        return <CheckCircle2 className="w-3 h-3 text-green-400" />
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-400" />
      case 'thinking':
        return <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />
    }
  }

  const getTypeColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'command':
        return 'text-amber-400'
      case 'file':
        return 'text-cyan-400'
      case 'complete':
        return 'text-green-400'
      case 'error':
        return 'text-red-400'
      case 'thinking':
        return 'text-purple-400'
    }
  }

  return (
    <div
      className="flex flex-col h-full border-l border-slate-800/50 bg-slate-900/30"
      style={{ maxHeight }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between">
        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
          Activity Log
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-slate-500">Live</span>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(100,200,255,0.15) transparent' }}
      >
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/20 border border-slate-800/30 animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <div className="mt-0.5">{getIcon(log.type)}</div>
            <div className="flex-1 min-w-0">
              {log.agentName && (
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                  {log.agentName}
                </div>
              )}
              <div className={`text-[10px] font-mono ${getTypeColor(log.type)} break-all`}>
                {log.text}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom status bar */}
      <div className="px-4 py-3 border-t border-slate-800/50 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <div className="text-[10px] font-mono">
            <span className="text-slate-400">{displayedState}</span>
            <span className="text-cyan-400">{'.'.repeat(dotCount)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
