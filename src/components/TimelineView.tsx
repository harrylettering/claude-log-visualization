import { useState, useCallback, useMemo, useRef, useEffect, memo, useLayoutEffect } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Search } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import {
  getEntryIcon,
  getEntryColor,
  getMessagePreview,
} from '../utils/timelineHelpers';
import { filterEntries } from '../utils/searchFilter';
import type { SearchFilters } from '../types/search';
import { DEFAULT_FILTERS } from '../types/search';
import { AdvancedSearchFilter } from './AdvancedSearchFilter';
import { detectLoop } from '../utils/loopDetector';
import { PromptOptimizer } from './PromptOptimizer';
import { ActionCardRenderer } from './AgentActionCards';

const OVERSCAN_COUNT = 3;
const BASE_ITEM_HEIGHT = 150; // 基础高度

interface TimelineViewProps {
  data: ParsedLogData;
  onStartReplay?: (index: number) => void;
  cliResult?: string;
  isCliAnalyzing?: boolean;
  cliError?: string;
  onRunCliAnalysis?: (prompt?: string) => void;
}

interface EntryWithKey {
  entry: any;
  index: number;
  key: string;
}

// 单条时间线条目组件
const TimelineEntry = memo(function TimelineEntry({
  entry,
  index,
  isExpanded,
  onToggle,
  totalItems,
  onMeasure,
}: {
  entry: any;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  totalItems: number;
  onMeasure?: (height: number) => void;
}) {
  const preview = useMemo(() => getMessagePreview(entry), [entry]);
  const previewWithEllipsis = preview.length >= 100 ? preview + '...' : preview;
  const cardRef = useRef<HTMLDivElement>(null);

  // 测量高度并通知父组件
  useLayoutEffect(() => {
    if (cardRef.current && onMeasure) {
      const height = cardRef.current.offsetHeight;
      onMeasure(height);
    }
  }, [isExpanded, onMeasure]);

  return (
    <div ref={cardRef} className="relative flex gap-4">
      {/* 时间点 */}
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full ${getEntryColor(entry.type)} flex items-center justify-center text-white z-10 shadow-lg relative group`}>
          {getEntryIcon(entry.type)}
          <div className="absolute inset-0 rounded-full animate-pulse-dot opacity-30 bg-current" style={{animationDelay: `${Math.min(index, 20) * 0.1}s`}}></div>
        </div>
        {index < totalItems - 1 && (
          <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-600 to-slate-800 mt-2" style={{ minHeight: '2rem' }} />
        )}
      </div>

      {/* 内容 */}
      <div className={`flex-1 min-w-0 ${entry.isForked ? 'opacity-40 grayscale-[0.5]' : ''}`}>
        <div className={`cyber-card p-5 overflow-hidden transition-all ${entry.isForked ? 'border-dashed border-slate-700 bg-slate-800/10' : ''} ${entry.parsedAction?.type === 'TerminalCommand' && (entry.parsedAction as any).exitCode !== 0 && (entry.parsedAction as any).exitCode !== -1 ? 'cyber-card-error' : ''}`}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{entry.type}</span>
              {entry.isForked && (
                <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-[9px] rounded-full shrink-0 border border-slate-600 uppercase font-black">
                  Ghost
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-slate-500 font-mono text-[10px]">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-slate-800 rounded-lg transition-colors text-slate-500"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="text-slate-300 text-sm">
            {entry.parsedAction ? (
              <ActionCardRenderer action={entry.parsedAction} />
            ) : (
              <p className="leading-relaxed opacity-80">{previewWithEllipsis}</p>
            )}
          </div>

          {isExpanded && (
            <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in slide-in-from-top-1">
              <pre className="text-[10px] text-blue-400/70 overflow-x-auto max-h-96 bg-black/40 p-4 rounded-xl w-full font-mono leading-relaxed">
                {JSON.stringify(entry, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// 动态高度虚拟滚动容器
function DynamicVirtualList({
  entriesWithKeys,
  expandedEntries,
  onToggleExpand,
  containerHeight,
}: {
  entriesWithKeys: EntryWithKey[];
  expandedEntries: Set<string>;
  onToggleExpand: (key: string) => void;
  containerHeight: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // 使用 ref 存储高度数组，避免状态更新导致的重新渲染
  const heightsRef = useRef<number[]>([]);
  const [version, setVersion] = useState(0); // 用于触发重渲染

  // 初始化高度数组
  useEffect(() => {
    heightsRef.current = new Array(entriesWithKeys.length).fill(BASE_ITEM_HEIGHT);
  }, [entriesWithKeys.length]);

  // 当展开状态变化时，重置相关高度
  useEffect(() => {
    // 展开状态变化后，等待 DOM 更新后重新测量
    const timeout = setTimeout(() => {
      setVersion(v => v + 1);
    }, 100);
    return () => clearTimeout(timeout);
  }, [expandedEntries]);

  // 测量单行高度
  const handleMeasure = useCallback((index: number, height: number) => {
    if (heightsRef.current[index] !== height) {
      heightsRef.current[index] = height;
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 计算累积高度（每行的 top 位置）
  const itemPositions = useMemo(() => {
    const positions: number[] = [];
    let cumulative = 0;
    for (let i = 0; i < entriesWithKeys.length; i++) {
      positions.push(cumulative);
      cumulative += heightsRef.current[i] || BASE_ITEM_HEIGHT;
    }
    return positions;
  }, [entriesWithKeys.length, version]);

  const totalHeight = itemPositions.length > 0
    ? itemPositions[itemPositions.length - 1] + (heightsRef.current[itemPositions.length - 1] || BASE_ITEM_HEIGHT)
    : 0;

  // 计算可见范围 - 二分查找优化
  const findVisibleRange = useCallback(() => {
    const heights = heightsRef.current;
    let startIndex = 0;
    let endIndex = entriesWithKeys.length - 1;

    // 找到第一个在可视区域下方的行
    for (let i = 0; i < entriesWithKeys.length; i++) {
      const itemTop = itemPositions[i];
      const itemBottom = itemTop + (heights[i] || BASE_ITEM_HEIGHT);
      if (itemBottom >= scrollTop) {
        startIndex = Math.max(0, i - OVERSCAN_COUNT);
        break;
      }
    }

    // 找到最后一个在可视区域上方的行
    for (let i = entriesWithKeys.length - 1; i >= 0; i--) {
      const itemTop = itemPositions[i];
      if (itemTop <= scrollTop + containerHeight) {
        endIndex = Math.min(entriesWithKeys.length - 1, i + OVERSCAN_COUNT);
        break;
      }
    }

    return { startIndex, endIndex };
  }, [entriesWithKeys.length, itemPositions, scrollTop, containerHeight]);

  const { startIndex, endIndex } = findVisibleRange();

  // 生成可见的行
  const visibleRows: JSX.Element[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const { entry, key } = entriesWithKeys[i];
    const isExpanded = expandedEntries.has(key);
    const top = itemPositions[i];

    visibleRows.push(
      <div
        key={key}
        style={{
          position: 'absolute',
          top: `${top}px`,
          left: 0,
          right: 0,
        }}
      >
        <TimelineEntry
          entry={entry}
          index={i}
          isExpanded={isExpanded}
          onToggle={() => onToggleExpand(key)}
          totalItems={entriesWithKeys.length}
          onMeasure={(height) => handleMeasure(i, height)}
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
      }}
      className="custom-scrollbar"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleRows}
      </div>
    </div>
  );
}

export function TimelineView({ data, cliResult, isCliAnalyzing, cliError, onRunCliAnalysis }: TimelineViewProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // 监听容器高度变化
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const toggleExpand = useCallback((uuid: string) => {
    setExpandedEntries(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(uuid)) {
        newExpanded.delete(uuid);
      } else {
        newExpanded.add(uuid);
      }
      return newExpanded;
    });
  }, []);

  // 过滤条目
  const searchResult = useMemo(() => {
    try {
      return filterEntries(data?.entries || [], filters);
    } catch (e) {
      console.error('过滤条目失败:', e);
      return { entries: [], filteredCount: 0, totalCount: 0 };
    }
  }, [data?.entries, filters]);
  const filteredEntries = searchResult.entries;

  // 预计算 entry key
  const entriesWithKeys = useMemo(() => {
    try {
      return filteredEntries.map((entry, index) => ({
        entry,
        index,
        key: entry.uuid || `fallback-${index}`,
      }));
    } catch (e) {
      console.error('处理条目失败:', e);
      return [];
    }
  }, [filteredEntries]);

  // 计算是否陷入死循环
  const loopWarning = useMemo(() => {
    try {
      return detectLoop(data?.entries || []);
    } catch (e) {
      console.error('检测死循环失败:', e);
      return null;
    }
  }, [data?.entries]);

  if (!data || !data.entries) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">暂无日志数据</p>
      </div>
    );
  }

  const listHeight = containerHeight - 200;

  return (
    <div className="flex gap-10 items-start h-[calc(100vh-180px)] overflow-hidden">
      {/* 左侧：时间轴 (可滚动) */}
      <div className="flex-1 overflow-hidden pr-6 h-full flex flex-col" ref={containerRef}>
        <div className="mb-4">
          <h2 className="text-2xl font-bold mb-2">会话时间线</h2>
          <p className="text-slate-400 text-sm">
            实时监控 AI 程序员的每一步动作与思考
            {entriesWithKeys.length > 1000 && (
              <span className="ml-2 text-amber-500/70 text-xs">
                (显示 {entriesWithKeys.length.toLocaleString()} 条中的虚拟滚动)
              </span>
            )}
          </p>
        </div>

        <AdvancedSearchFilter
          entries={data.entries}
          filters={filters}
          onFiltersChange={setFilters}
          resultCount={searchResult.filteredCount}
          totalCount={searchResult.totalCount}
        />

        {entriesWithKeys.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-slate-900/20 rounded-3xl border-2 border-dashed border-slate-800">
            <div className="text-center">
              <Search className="w-8 h-8 text-slate-800 mx-auto mb-2" />
              <p className="text-slate-600 text-sm font-bold">没有匹配的日志条目</p>
            </div>
          </div>
        ) : (
          <DynamicVirtualList
            entriesWithKeys={entriesWithKeys}
            expandedEntries={expandedEntries}
            onToggleExpand={toggleExpand}
            containerHeight={Math.max(listHeight, 200)}
          />
        )}

        {loopWarning && (
          <div className="relative flex gap-4 mt-4">
            <div className="flex flex-col items-center">
               <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white z-10 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]">
                  <AlertTriangle className="w-4 h-4" />
               </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="rounded-2xl border border-red-500/50 bg-red-950/20 p-6 overflow-hidden relative shadow-2xl">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-rose-400 to-red-600 bg-[length:200%_100%] animate-[gradient_2s_linear_infinite]" />
                 <div className="flex items-start gap-4">
                    <AlertTriangle className="w-8 h-8 text-red-500 shrink-0 mt-0.5" />
                    <div>
                       <h3 className="text-lg font-black text-red-400 mb-1 uppercase tracking-tight">Agent Loop Detected</h3>
                       <p className="text-red-200/70 text-sm leading-relaxed mb-4">{loopWarning.message}</p>
                       <div className="p-4 bg-black/40 rounded-xl border border-red-500/20 font-mono text-[11px] text-red-300 shadow-inner">
                          <strong className="text-red-500/80 block mb-1 uppercase tracking-widest text-[9px]">Failing Command:</strong>
                          <span className="select-all opacity-90">{loopWarning.repeatedCommand}</span>
                          <span className="ml-4 px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 font-black">FAIL COUNT: {loopWarning.failureCount}</span>
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 右侧：大脑建议面板 */}
      <aside className="w-[400px] h-full sticky top-0 animate-in slide-in-from-right-4 duration-500">
        <PromptOptimizer
          data={data}
          cliResult={cliResult}
          isCliAnalyzing={isCliAnalyzing}
          cliError={cliError}
          onRunCliAnalysis={onRunCliAnalysis}
        />
      </aside>
    </div>
  );
}
