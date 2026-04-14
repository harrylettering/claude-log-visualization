import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Info, FileJson, Brain, Loader2, Zap, ArrowRight, Terminal, RefreshCw } from 'lucide-react';
import type { ParsedLogData } from '../types/log';
import type { Lesson } from '../utils/rulesExtractor';
import { extractLessons } from '../utils/rulesExtractor';
import { ActionCardRenderer } from './AgentActionCards';

interface PromptOptimizerProps {
  data: ParsedLogData;
  cliResult?: string;
  isCliAnalyzing?: boolean;
  onRunCliAnalysis?: (prompt?: string) => void;
  cliError?: string;
}

export const PromptOptimizer: React.FC<PromptOptimizerProps> = ({ data, cliResult, isCliAnalyzing, onRunCliAnalysis, cliError: _cliError }) => {
  const [_copiedId, _setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cli' | 'rules'>('cli');
  const [customPrompt, setCustomPrompt] = useState<string>('');

  const defaultPrompt = `你是一位顶级的 AI 协作专家。请阅读以下对话日志（已结构化压缩），并进行深度复盘。
请直接给出以下内容：
1. 协作总结：一句话概括表现。
2. 成功经验：哪些做法值得保持？
3. 避坑指南：哪些做法导致了低效或错误？
4. 优化建议：针对未来的 3 条具体改进方案。
请使用清晰的 Markdown 格式输出。`;

  // 基础规则提取 (启发式)
  const lessons: Lesson[] = useMemo(() => extractLessons(data.entries), [data.entries]);

  // 导出复盘文档
  const exportRetrospective = () => {
    const timestamp = new Date().toLocaleString('zh-CN');
    let content = `# Claude 会话复盘报告\n\n生成时间：${timestamp}\n\n---\n\n## 终端复盘总结\n\n${cliResult || '暂无终端复盘结果'}\n\n---\n\n## 自动提取经验规则\n\n`;

    if (lessons.length === 0) {
      content += '暂无提取到的规则';
    } else {
      lessons.forEach((lesson, index) => {
        content += `### ${index + 1}. 错误命令\n\`${lesson.errorCommand}\`\n\n### 推荐规则\n${lesson.suggestedRule}\n\n---\n\n`;
      });
    }

    // 下载文件
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `claude-retrospective-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shadow-lg shadow-indigo-900/20">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight italic">BRAIN<span className="text-indigo-500">INSIGHTS</span></h2>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">Neural Experience Protocol</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-slate-950/80 rounded-xl border border-slate-800/50 backdrop-blur-sm">
        {[
          { id: 'cli', label: '智能分析', icon: <Terminal className="w-3 h-3" /> },
          { id: 'rules', label: '错误日志', icon: <Zap className="w-3 h-3" /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/30'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
        {/* CLI 复盘展示区 */}
        {activeTab === 'cli' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            {isCliAnalyzing && (
               <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-4">
                  <div className="relative">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <Terminal className="w-3 h-3 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Streaming from Terminal...</p>
                    <p className="text-[9px] text-slate-500 font-bold uppercase">Claude 正在实时分析当前活跃日志</p>
                  </div>
               </div>
            )}
            
            {!isCliAnalyzing && !cliResult && (
              <div className="space-y-4">
                <div className="cyber-card p-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                    自定义分析指令（可选）
                  </label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder={defaultPrompt}
                    className="w-full h-[180px] bg-black/40 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 font-mono resize-none focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
                  <p className="mt-2 text-[9px] text-slate-500">
                    留空则使用默认复盘指令，支持任意自定义分析需求，比如："总结本次对话的核心需求"、"提取代码修改清单"等。
                  </p>
                </div>
                <button
                  onClick={() => onRunCliAnalysis?.(customPrompt.trim() || undefined)}
                  className="cyber-btn w-full py-3 text-[10px] font-black rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  执行智能分析
                </button>
              </div>
            )}

            {cliResult && !isCliAnalyzing && (
              <div className="space-y-3">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => onRunCliAnalysis?.(customPrompt.trim() || undefined)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black rounded-lg transition-all uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    重新分析
                  </button>
                </div>
                <div className="cyber-card p-6 shadow-2xl text-slate-300 relative group markdown-content">
                  <div className="absolute top-4 right-4 opacity-10">
                     <Terminal className="w-10 h-10" />
                  </div>
                  <ReactMarkdown>{cliResult}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 自动规则提取 */}
        {activeTab === 'rules' && (
          <div className="space-y-4 animate-in fade-in duration-500">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">错误日志收集</h3>
            {lessons.length === 0 ? (
              <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                <Info className="w-8 h-8 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm font-medium px-10">会话中暂未发现执行失败的工具操作。</p>
              </div>
            ) : (
              lessons.map((lesson) => (
                <div key={lesson.id} className="mb-4">
                  {/* 错误卡片 */}
                  {lesson.entry?.parsedAction && (
                    <ActionCardRenderer action={lesson.entry.parsedAction} />
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer / Export */}
      {(lessons.length > 0 || cliResult) && (
        <div className="cyber-card p-4 bg-gradient-to-br from-indigo-600/20 to-blue-700/20 border-indigo-500/30 shadow-xl shadow-indigo-900/20">
          <div className="flex items-center gap-3 mb-2 text-white">
            <FileJson className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-widest gradient-text">导出复盘文档</span>
          </div>
          <p className="text-[10px] text-indigo-100/70 mb-4 font-medium">导出本次会话的复盘总结与错误日志，用于后续参考。</p>
          <button
            onClick={exportRetrospective}
            className="cyber-btn w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all flex items-center justify-center gap-2"
          >
            下载 Markdown 报告 <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
