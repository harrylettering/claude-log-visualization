import { useEffect, useRef, useState, useCallback } from 'react'
import { useFlowStore, type ActivityLogEntry } from '../store/flowStore'
import {
  Terminal,
  FileCode2,
  Search,
  CheckCircle2,
  XCircle,
  GitBranch,
  Sparkles,
  ChevronDown,
  Copy,
  CheckCheck,
} from 'lucide-react'

// ─── Activity Item ───────────────────────────────────────────────────────────

interface ActivityItemProps {
  entry: ActivityLogEntry
  isNew: boolean
}

function ActivityItem({ entry, isNew }: ActivityItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(entry.message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [entry.message])

  const icon = {
    command: <Terminal className="w-3.5 h-3.5 text-green-400" />,
    file: <FileCode2 className="w-3.5 h-3.5 text-amber-400" />,
    search: <Search className="w-3.5 h-3.5 text-blue-400" />,
    result: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    error: <XCircle className="w-3.5 h-3.5 text-red-400" />,
    spawn: <GitBranch className="w-3.5 h-3.5 text-purple-400" />,
    complete: <Sparkles className="w-3.5 h-3.5 text-cyan-400" />,
  }[entry.type] ?? <Terminal className="w-3.5 h-3.5 text-slate-400" />

  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div
      className={`
        group relative px-3 py-2 border-b border-slate-800/50 transition-all duration-300
        hover:bg-slate-800/30 cursor-pointer
        ${isNew ? 'animate-in slide-in-from-right-4 fade-in' : ''}
        ${entry.isError ? 'bg-red-500/5' : ''}
      `}
      onClick={() => entry.details && setExpanded(!expanded)}
    >
      {/* Timestamp + icon row */}
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-600 font-mono">{time}</span>
            {entry.isError && (
              <span className="px-1 py-0.5 rounded text-[7px] font-black bg-red-500/20 text-red-400 uppercase tracking-wider">
                Error
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-300 font-mono leading-snug mt-0.5 break-all">
            {entry.message}
          </div>
          {entry.details && (
            <div className="text-[9px] text-slate-500 mt-0.5 truncate">
              {expanded ? '▼ ' : '▶ '}{entry.details}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-700 rounded"
        >
          {copied ? (
            <CheckCheck className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 text-slate-500" />
          )}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && entry.details && (
        <div className="mt-2 p-2 rounded bg-slate-900/80 border border-slate-700/50">
          <pre className="text-[9px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
            {entry.details}
          </pre>
        </div>
      )}
    </div>
  )
}

// ─── Typewriter Status ───────────────────────────────────────────────────────

function TypewriterStatus() {
  const { agentState } = useFlowStore()
  const [dots, setDots] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    let frame: number
    let charIdx = 0

    const animate = () => {
      if (!isDeleting) {
        // Typing
        if (charIdx <= agentState.length) {
          setDisplayedText(agentState.slice(0, charIdx))
          charIdx++
          frame = setTimeout(animate, 60)
        } else {
          // Pause at end, then start deleting
          frame = setTimeout(() => setIsDeleting(true), 2000)
        }
      } else {
        // Deleting
        if (charIdx >= 0) {
          setDisplayedText(agentState.slice(0, charIdx))
          charIdx--
          frame = setTimeout(animate, 30)
        } else {
          // Switch to next state
          setIsDeleting(false)
          charIdx = 0
          // Trigger state change via custom event
          window.dispatchEvent(new CustomEvent('flowStateChange'))
        }
      }
    }

    frame = setTimeout(animate, isDeleting ? 30 : 60)
    return () => clearTimeout(frame)
  }, [agentState, isDeleting])

  // Animate dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-t border-slate-700/50">
      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
      <span className="text-[11px] font-mono text-cyan-300">
        {displayedText}
        <span className="animate-pulse">{dots}</span>
      </span>
    </div>
  )
}

// ─── Main Sidebar Component ──────────────────────────────────────────────────

interface ActivitySidebarProps {
  maxHeight?: string
}

export function ActivitySidebar({ maxHeight = 'calc(100vh - 350px)' }: ActivitySidebarProps) {
  const { activityLog, addActivityLog } = useFlowStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const prevLogLengthRef = useRef(0)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (autoScroll && scrollRef.current && activityLog.length > prevLogLengthRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
    prevLogLengthRef.current = activityLog.length
  }, [activityLog, autoScroll])

  // Detect manual scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    setAutoScroll(isAtBottom)
  }, [])

  // Add some initial demo entries if empty
  useEffect(() => {
    if (activityLog.length === 0) {
      const demoEntries: Omit<ActivityLogEntry, 'id' | 'timestamp'>[] = [
        { type: 'spawn', message: 'Orchestrator initialized', details: 'Main agent ready' },
        { type: 'command', message: 'git diff --cached', details: 'Checking staged changes' },
        { type: 'file', message: 'Read src/components/App.tsx', details: '155 lines' },
        { type: 'command', message: 'npm run build', details: 'Building production bundle' },
        { type: 'complete', message: 'Build completed', details: 'Output: dist/' },
      ]

      demoEntries.forEach((entry, i) => {
        setTimeout(() => {
          addActivityLog(entry)
        }, i * 300)
      })
    }
  }, [activityLog.length, addActivityLog])

  const filteredLog = filter
    ? activityLog.filter(e => e.type === filter)
    : activityLog

  const filterOptions: { type: ActivityLogEntry['type']; label: string }[] = [
    { type: 'command', label: 'Terminal' },
    { type: 'file', label: 'File' },
    { type: 'search', label: 'Search' },
    { type: 'result', label: 'Result' },
    { type: 'error', label: 'Error' },
  ]

  return (
    <div className="flex flex-col bg-[#0a0a0c] border-l border-slate-800 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-cyan-500/20 flex items-center justify-center">
            <Terminal className="w-3 h-3 text-cyan-400" />
          </div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Activity Log
          </span>
          <span className="text-[8px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
            {activityLog.length}
          </span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter(null)}
            className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-all ${
              !filter ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            All
          </button>
          {filterOptions.map(opt => (
            <button
              key={opt.type}
              onClick={() => setFilter(filter === opt.type ? null : opt.type)}
              className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-all ${
                filter === opt.type ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-scroll toggle */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900/30 border-b border-slate-800/50">
        <span className="text-[9px] text-slate-500">Auto-scroll</span>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`w-8 h-4 rounded-full transition-all relative ${
            autoScroll ? 'bg-cyan-500/30' : 'bg-slate-700'
          }`}
        >
          <div
            className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
              autoScroll ? 'left-4 bg-cyan-400' : 'left-0.5 bg-slate-400'
            }`}
          />
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ maxHeight }}
      >
        {filteredLog.map((entry, i) => (
          <ActivityItem
            key={entry.id}
            entry={entry}
            isNew={i === filteredLog.length - 1}
          />
        ))}

        {filteredLog.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-slate-600">
            <Terminal className="w-8 h-8 mb-2 opacity-30" />
            <span className="text-xs">No activity yet</span>
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && activityLog.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true)
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }
          }}
          className="absolute bottom-20 right-4 px-3 py-1.5 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-bold text-cyan-400 hover:bg-cyan-500/30 transition-all shadow-lg"
        >
          <ChevronDown className="w-3 h-3 inline mr-1" />
          Jump to latest
        </button>
      )}

      {/* Typewriter status at bottom */}
      <TypewriterStatus />
    </div>
  )
}
