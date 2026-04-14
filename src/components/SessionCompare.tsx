import { useState, useCallback, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Upload,
  X,
  BarChart3,
  Zap,
  Settings,
  Minus,
  TrendingUp,
  TrendingDown,
  FileText,
  Brain,
  Loader2,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import { parseLog, formatDuration, formatTokens, compressLogEntries } from '../utils/logParser';

interface SessionCompareProps {
  defaultSession?: ParsedLogData;
}

type LoadedSession = {
  data: ParsedLogData;
  name: string;
};

function StatCard({
  label,
  valueA,
  valueB,
  formatFn = (v: number | string) => String(v),
  isHigherBetter = true,
}: {
  label: string;
  valueA: number | string;
  valueB: number | string;
  formatFn?: (v: number | string) => string;
  isHigherBetter?: boolean;
}) {
  const numA = typeof valueA === 'number' ? valueA : 0;
  const numB = typeof valueB === 'number' ? valueB : 0;
  const diff = numB - numA;
  const diffPercent = numA > 0 ? (diff / numA) * 100 : 0;

  const getDiffIcon = () => {
    if (diff === 0) return <Minus className="w-4 h-4 text-slate-400" />;
    const isBetter = isHigherBetter ? diff > 0 : diff < 0;
    if (isBetter) {
      return <TrendingUp className="w-4 h-4 text-green-400" />;
    }
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  };

  const getDiffClass = () => {
    if (diff === 0) return 'text-slate-400';
    const isBetter = isHigherBetter ? diff > 0 : diff < 0;
    return isBetter ? 'text-green-400' : 'text-red-400';
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
      <div className="text-sm text-slate-400 mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-2xl font-bold text-blue-400">{formatFn(valueA)}</div>
          <div className="text-xs text-slate-500 mt-1">会话 A</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-400">{formatFn(valueB)}</div>
          <div className="text-xs text-slate-500 mt-1">会话 B</div>
        </div>
      </div>
      {typeof valueA === 'number' && typeof valueB === 'number' && (
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2">
          {getDiffIcon()}
          <span className={`text-sm font-medium ${getDiffClass()}`}>
            {diff > 0 ? '+' : ''}{diff !== 0 ? formatFn(diff) : '无变化'}
            {diffPercent !== 0 && (
              <span className="text-xs ml-1">
                ({diffPercent > 0 ? '+' : ''}{diffPercent.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function SessionCompare({ defaultSession }: SessionCompareProps) {
  const [sessionA, setSessionA] = useState<LoadedSession | null>(
    defaultSession ? { data: defaultSession, name: '当前会话' } : null
  );
  const [sessionB, setSessionB] = useState<LoadedSession | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  // AI 对比分析状态
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState('');
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isWsConnected, setIsWsConnected] = useState(false);

  // 建立 WebSocket 连接
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:4000');
    wsRef.current = ws;

    ws.onopen = () => {
      setIsWsConnected(true);
      console.log('[WS] SessionCompare 已连接');
    };

    ws.onclose = () => {
      setIsWsConnected(false);
      console.log('[WS] SessionCompare 连接已断开');
    };

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);

        if (type === 'compare-analysis-start') {
          setIsAnalyzing(true);
          setAnalyzeResult('');
          setAnalyzeError(null);
        } else if (type === 'compare-analysis-chunk') {
          setAnalyzeResult(prev => prev + payload);
        } else if (type === 'compare-analysis-end') {
          setIsAnalyzing(false);
        } else if (type === 'compare-analysis-error') {
          setIsAnalyzing(false);
          setAnalyzeError(payload);
        }
      } catch (e) {
        console.error('[WS] 消息解析失败', e);
      }
    };

    return () => ws.close();
  }, []);

  const handleLoadSession = useCallback((slot: 'a' | 'b') => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jsonl,.json,.log';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const setLoading = slot === 'a' ? setLoadingA : setLoadingB;
      const setSession = slot === 'a' ? setSessionA : setSessionB;

      setLoading(true);

      try {
        const content = await file.text();
        const result = parseLog(content);
        setSession({
          data: result.data,
          name: file.name,
        });
        // 清除之前的分析结果
        setAnalyzeResult('');
        setAnalyzeError(null);
      } catch (err) {
        console.error('Failed to load session:', err);
        alert('加载会话失败，请检查文件格式');
      } finally {
        setLoading(false);
      }
    };
    input.click();
  }, []);

  const clearSession = useCallback((slot: 'a' | 'b') => {
    if (slot === 'a') {
      setSessionA(null);
    } else {
      setSessionB(null);
    }
    setAnalyzeResult('');
    setAnalyzeError(null);
  }, []);

  // 运行 AI 对比分析
  const runCompareAnalysis = useCallback(() => {
    if (!sessionA || !sessionB || !wsRef.current || !isWsConnected) return;

    // 压缩两个会话
    const compressedA = compressLogEntries(sessionA.data.entries);
    const compressedB = compressLogEntries(sessionB.data.entries);

    wsRef.current.send(JSON.stringify({
      type: 'compare-sessions-analysis',
      data: { sessionA: compressedA, sessionB: compressedB }
    }));
  }, [sessionA, sessionB, isWsConnected]);

  const bothLoaded = sessionA && sessionB;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <BarChart3 className="w-6 h-6" />
          会话对比
        </h2>
        <p className="text-slate-400">加载两个会话进行对比分析</p>
      </div>

      {/* 会话加载区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 会话 A */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              会话 A
            </h3>
            {sessionA && (
              <button
                onClick={() => clearSession('a')}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {sessionA ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3">
                <FileText className="w-4 h-4 inline mr-2 text-slate-400" />
                {sessionA.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">消息数</div>
                  <div className="font-semibold">{sessionA.data.stats.totalMessages}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Token</div>
                  <div className="font-semibold">{formatTokens(sessionA.data.stats.totalTokens)}</div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleLoadSession('a')}
              disabled={loadingA}
              className="w-full py-8 border-2 border-dashed border-slate-600 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingA ? (
                <div className="text-slate-400">加载中...</div>
              ) : (
                <div className="text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  点击加载会话 A
                </div>
              )}
            </button>
          )}
        </div>

        {/* 会话 B */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              会话 B
            </h3>
            {sessionB && (
              <button
                onClick={() => clearSession('b')}
                className="p-1 hover:bg-slate-700 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {sessionB ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3">
                <FileText className="w-4 h-4 inline mr-2 text-slate-400" />
                {sessionB.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">消息数</div>
                  <div className="font-semibold">{sessionB.data.stats.totalMessages}</div>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2">
                  <div className="text-slate-500 text-xs">Token</div>
                  <div className="font-semibold">{formatTokens(sessionB.data.stats.totalTokens)}</div>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleLoadSession('b')}
              disabled={loadingB}
              className="w-full py-8 border-2 border-dashed border-slate-600 rounded-lg hover:border-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingB ? (
                <div className="text-slate-400">加载中...</div>
              ) : (
                <div className="text-slate-400">
                  <Upload className="w-8 h-8 mx-auto mb-2" />
                  点击加载会话 B
                </div>
              )}
            </button>
          )}
        </div>
      </div>

      {/* AI 对比分析按钮 */}
      {bothLoaded && (
        <div className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-xl border border-indigo-500/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">AI 对比分析</h3>
                <p className="text-sm text-slate-400">让 AI 判断哪个会话效果更好</p>
              </div>
            </div>
            {analyzeResult && !isAnalyzing && (
              <button
                onClick={runCompareAnalysis}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" />
                重新分析
              </button>
            )}
          </div>

          {!analyzeResult && !isAnalyzing && !analyzeError && (
            <button
              onClick={runCompareAnalysis}
              disabled={!isWsConnected}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-600 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              {isWsConnected ? '开始 AI 对比分析' : '等待连接...'}
            </button>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-3 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/30">
              <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-indigo-400 animate-pulse">AI 正在分析对比中...</p>
                <p className="text-xs text-slate-500">Claude 正在对比两个会话的质量和效率</p>
              </div>
            </div>
          )}

          {analyzeError && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-xl border border-red-500/30">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400">分析失败</p>
                <p className="text-xs text-slate-400">{analyzeError}</p>
              </div>
            </div>
          )}

          {analyzeResult && !isAnalyzing && (
            <div className="mt-4 p-4 bg-slate-900/50 rounded-xl border border-slate-700">
              <div className="markdown-content text-slate-300">
                <ReactMarkdown>{analyzeResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 对比结果 */}
      {bothLoaded ? (
        <div className="space-y-6">
          {/* 总体统计 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              总体统计对比
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="总消息数"
                valueA={sessionA.data.stats.totalMessages}
                valueB={sessionB.data.stats.totalMessages}
                isHigherBetter={false}
              />
              <StatCard
                label="用户消息"
                valueA={sessionA.data.stats.userMessages}
                valueB={sessionB.data.stats.userMessages}
                isHigherBetter={false}
              />
              <StatCard
                label="助手消息"
                valueA={sessionA.data.stats.assistantMessages}
                valueB={sessionB.data.stats.assistantMessages}
                isHigherBetter={true}
              />
              <StatCard
                label="工具调用"
                valueA={sessionA.data.stats.toolCalls}
                valueB={sessionB.data.stats.toolCalls}
              />
              <StatCard
                label="会话时长"
                valueA={sessionA.data.stats.sessionDuration}
                valueB={sessionB.data.stats.sessionDuration}
                formatFn={(v) => formatDuration(v as number)}
                isHigherBetter={false}
              />
            </div>
          </div>

          {/* Token 对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Token 使用对比
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="输入 Token"
                valueA={sessionA.data.stats.inputTokens}
                valueB={sessionB.data.stats.inputTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={false}
              />
              <StatCard
                label="输出 Token"
                valueA={sessionA.data.stats.outputTokens}
                valueB={sessionB.data.stats.outputTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={true}
              />
              <StatCard
                label="总计 Token"
                valueA={sessionA.data.stats.totalTokens}
                valueB={sessionB.data.stats.totalTokens}
                formatFn={(v) => formatTokens(v as number)}
                isHigherBetter={false}
              />
            </div>
          </div>

          {/* 工具对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              工具使用对比
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  {sessionA.name}
                </h4>
                <div className="space-y-2">
                  {Array.from(new Map(
                    sessionA.data.toolCalls.map(t => [t.name, t])
                  ).values()).map((tool, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-slate-400">
                          {sessionA.data.toolCalls.filter(t => t.name === tool.name).length} 次
                        </span>
                      </div>
                    </div>
                  )).slice(0, 5)}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  {sessionB.name}
                </h4>
                <div className="space-y-2">
                  {Array.from(new Map(
                    sessionB.data.toolCalls.map(t => [t.name, t])
                  ).values()).map((tool, idx) => (
                    <div key={idx} className="bg-slate-900/50 rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{tool.name}</span>
                        <span className="text-slate-400">
                          {sessionB.data.toolCalls.filter(t => t.name === tool.name).length} 次
                        </span>
                      </div>
                    </div>
                  )).slice(0, 5)}
                </div>
              </div>
            </div>
          </div>

          {/* 模型对比 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              使用的模型
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-2">会话 A</div>
                <div className="flex flex-wrap gap-2">
                  {sessionA.data.stats.modelsUsed.length > 0 ? (
                    sessionA.data.stats.modelsUsed.map((model, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm border border-blue-500/30">
                        {model}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">无模型信息</span>
                  )}
                </div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-2">会话 B</div>
                <div className="flex flex-wrap gap-2">
                  {sessionB.data.stats.modelsUsed.length > 0 ? (
                    sessionB.data.stats.modelsUsed.map((model, idx) => (
                      <span key={idx} className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm border border-purple-500/30">
                        {model}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm">无模型信息</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-12 text-center">
          <BarChart3 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">请加载两个会话开始对比</p>
        </div>
      )}
    </div>
  );
}
