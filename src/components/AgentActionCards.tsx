import React, { useState, useEffect } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import type { AgentAction } from '../types/agent';
import { Terminal, FileCode2, BookOpen, BrainCircuit, Trash2, MoveHorizontal, Search, AlertCircle, Zap, Monitor, MousePointerClick, Image as ImageIcon, MessageSquare, RefreshCw, Check } from 'lucide-react';
import { getImage } from '../utils/imageStore';

export const ActionCardRenderer: React.FC<{ action: AgentAction }> = ({ action }) => {
  const renderCard = () => {
    switch (action.type) {
      case 'TerminalCommand': return <TerminalCard action={action} />;
      case 'CodeWrite': return <DiffCard action={action} />;
      case 'CodeDelete': return <DeleteCard action={action} />;
      case 'CodeMove': return <MoveCard action={action} />;
      case 'CodeSearch': return <SearchCard action={action} />;
      case 'CodeRead': return <CodeReadCard action={action} />;
      case 'AgentThought': return <ThoughtCard action={action} />;
      case 'ScreenCapture': return <ScreenCaptureCard action={action} />;
      case 'ComputerUse': return <ComputerUseCard action={action} />;
      case 'UserImage': return <UserImageCard action={action} />;
      case 'TaskCreate':
        return (
          <div className="cyber-card mt-3 border-violet-500/30 bg-violet-950/10 overflow-hidden shadow-lg">
            <div className="bg-violet-900/30 px-4 py-3 flex items-center gap-3 border-b border-violet-500/20">
              <Zap className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-black text-violet-400 uppercase tracking-widest">Created Task</span>
            </div>
            <div className="p-5 bg-black/40 space-y-3">
              <div>
                <span className="text-[9px] font-black text-violet-300/60 uppercase tracking-widest block mb-1">Subject</span>
                <p className="text-sm font-bold text-white">{action.subject}</p>
              </div>
              {action.description && (
                <div>
                  <span className="text-[9px] font-black text-violet-300/60 uppercase tracking-widest block mb-1">Description</span>
                  <p className="text-xs text-violet-100/80 leading-relaxed">{action.description}</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'TaskUpdate':
        return (
          <div className="cyber-card mt-3 border-blue-500/30 bg-blue-950/10 overflow-hidden shadow-lg">
            <div className="bg-blue-900/30 px-4 py-3 flex items-center gap-3 border-b border-blue-500/20">
              <RefreshCw className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-black text-blue-400 uppercase tracking-widest">Updated Task #{action.taskId}</span>
            </div>
            <div className="p-5 bg-black/40 space-y-3">
              {action.status && (
                <div>
                  <span className="text-[9px] font-black text-blue-300/60 uppercase tracking-widest block mb-1">Status</span>
                  <p className="text-sm font-bold text-white">{action.status}</p>
                </div>
              )}
              {action.subject && (
                <div>
                  <span className="text-[9px] font-black text-blue-300/60 uppercase tracking-widest block mb-1">Subject</span>
                  <p className="text-xs text-blue-100/80">{action.subject}</p>
                </div>
              )}
            </div>
          </div>
        );
      case 'TaskResult':
        return (
          <div className={`cyber-card mt-3 overflow-hidden shadow-lg ${action.isError ? 'border-red-500/30 bg-red-950/10' : 'border-green-500/30 bg-green-950/10'}`}>
            <div className={`px-4 py-3 flex items-center gap-3 border-b ${action.isError ? 'bg-red-900/30 border-red-500/20' : 'bg-green-900/30 border-green-500/20'}`}>
              {action.isError ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Check className="w-5 h-5 text-green-400" />
              )}
              <span className={`text-xs font-black uppercase tracking-widest ${action.isError ? 'text-red-400' : 'text-green-400'}`}>
                {action.isError ? 'Tool Error' : 'Tool Result'}
              </span>
            </div>
            <div className="p-5 bg-black/40">
              <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed ${action.isError ? 'text-red-200/90' : 'text-green-200/90'}`}>
                {action.content}
              </pre>
            </div>
          </div>
        );
      case 'GenericToolCall':
        return (
          <div className="cyber-card mt-3 border-cyan-500/30 bg-cyan-950/10 overflow-hidden shadow-lg">
            <div className="bg-cyan-900/30 px-4 py-3 flex items-center gap-3 border-b border-cyan-500/20">
              <Terminal className="w-5 h-5 text-cyan-400" />
              <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">{action.name}</span>
            </div>
            <div className="p-5 bg-black/40">
              <pre className="text-xs font-mono text-cyan-100/80 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {JSON.stringify(action.input, null, 2)}
              </pre>
            </div>
          </div>
        );
      case 'UserMessage':
        return (
          <div className="cyber-card mt-3 border-sky-500/30 bg-sky-950/10 overflow-hidden shadow-lg">
            <div className="bg-sky-900/30 px-4 py-3 flex items-center gap-3 border-b border-sky-500/20">
              <MessageSquare className="w-5 h-5 text-sky-400" />
              <span className="text-xs font-black text-sky-400 uppercase tracking-widest">User Request</span>
            </div>
            <div className="p-5 bg-black/40">
              <div className="prose prose-invert prose-sm max-w-none text-sky-50/90 leading-relaxed whitespace-pre-wrap">
                {action.content}
              </div>
            </div>
          </div>
        );
      case 'AssistantText':
        return (
          <div className="cyber-card mt-3 border-indigo-500/20 bg-indigo-950/10 overflow-hidden shadow-lg">
            <div className="bg-indigo-900/20 px-4 py-3 flex items-center gap-3 border-b border-indigo-500/20">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">Assistant Response</span>
            </div>
            <div className="p-5 bg-black/40">
              <div className="prose prose-invert prose-sm max-w-none text-indigo-50/90 leading-relaxed whitespace-pre-wrap">
                {action.content}
              </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="group/card relative">
      {renderCard()}
      
      {/* 底部工具栏：Token 统计 & 极客探查器入口 */}
      <div className="mt-4 flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          {action.usage && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200 bg-amber-900/30 px-3 py-1 rounded-full border border-amber-600/30 shadow-md shadow-amber-900/10">
              <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="font-black">{action.usage.total.toLocaleString()} tokens</span>
              <span className="opacity-60 font-normal text-amber-100/70">(In: {action.usage.input.toLocaleString()} | Out: {action.usage.output.toLocaleString()})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TerminalCard: React.FC<{ action: Extract<AgentAction, { type: 'TerminalCommand' }> }> = ({ action }) => {
  const isError = action.exitCode !== 0 && action.exitCode !== -1;
  const isPending = action.exitCode === -1;
  
  return (
    <div className={`mt-3 rounded-xl border overflow-hidden ${isError ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-slate-700 bg-slate-900/50'}`}>
      <div className="bg-slate-800 px-3 py-2 flex items-center gap-2 border-b border-slate-700/50">
        <Terminal className={`w-4 h-4 ${isError ? 'text-red-400' : 'text-slate-400'}`} />
        <span className="text-xs font-mono text-slate-300 flex-1 truncate">{action.command}</span>
        {isPending && <span className="text-[10px] text-blue-400 animate-pulse uppercase tracking-wider font-semibold">Running</span>}
        {!isPending && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${isError ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
            Exit: {action.exitCode}
          </span>
        )}
      </div>
      <div className="bg-[#0c0c0c] p-4 overflow-x-auto max-h-[400px] custom-scrollbar">
        <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed ${isError ? 'text-red-400' : 'text-slate-300'}`}>
          {action.stderr || action.output || (isPending ? 'Waiting for command to complete...' : '(No output returned)')}
        </pre>
      </div>
    </div>
  );
};

const DiffCard: React.FC<{ action: Extract<AgentAction, { type: 'CodeWrite' }> }> = ({ action }) => {
  return (
    <div className="mt-3 rounded-xl border border-slate-700 overflow-hidden shadow-2xl bg-slate-900/50">
      <div className="bg-slate-800/80 px-4 py-3 flex flex-col gap-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
           <FileCode2 className="w-5 h-5 text-blue-400" />
           <span className="text-sm font-black text-slate-200 font-mono tracking-tight">{action.filePath}</span>
        </div>
        {action.instruction && (
          <span className="text-[10px] text-slate-500 border-l-2 border-blue-500/50 pl-2 ml-1 italic font-medium">
            {action.instruction}
          </span>
        )}
      </div>
      <div className="bg-[#0f172a] text-sm overflow-auto max-h-[500px] custom-scrollbar">
        <ReactDiffViewer 
          oldValue={action.before || ''} 
          newValue={action.after || ''} 
          splitView={true} 
          useDarkTheme={true}
          compareMethod={DiffMethod.WORDS}
          leftTitle="Original"
          rightTitle="Modified"
          styles={{
             variables: { 
                 dark: { 
                     diffViewerBackground: '#0f172a', 
                     addedBackground: '#064e3b', 
                     removedBackground: '#7f1d1d',
                     wordAddedBackground: '#047857',
                     wordRemovedBackground: '#991b1b'
                 } 
             }
          }}
        />
      </div>
    </div>
  );
};

const DeleteCard: React.FC<{ action: Extract<AgentAction, { type: 'CodeDelete' }> }> = ({ action }) => (
  <div className="mt-3 p-4 rounded-2xl border border-red-500/30 bg-red-500/5 backdrop-blur-sm relative overflow-hidden group/del">
    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover/del:opacity-10 transition-opacity">
       <Trash2 className="w-16 h-16 text-red-500" />
    </div>
    <div className="flex items-center gap-4 mb-2 relative z-10">
      <div className="p-3 rounded-xl bg-red-500/20 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
        <AlertCircle className="w-5 h-5 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-[10px] font-black text-red-500/80 uppercase tracking-[0.2em] mb-1">Destructive Action: Delete</h4>
        <p className="text-sm font-black text-slate-100 font-mono break-all">{action.filePath}</p>
      </div>
    </div>
    {action.instruction && (
      <p className="text-[10px] text-red-300/40 italic pl-14 relative z-10">{action.instruction}</p>
    )}
  </div>
);

const MoveCard: React.FC<{ action: Extract<AgentAction, { type: 'CodeMove' }> }> = ({ action }) => (
  <div className="cyber-card mt-3 p-5 border-purple-500/30 bg-purple-500/5 backdrop-blur-sm">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400">
        <MoveHorizontal className="w-5 h-5" />
      </div>
      <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">File Relocation</h4>
    </div>
    <div className="flex flex-col gap-3 ml-12">
      <div className="space-y-1">
        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">From</span>
        <div className="text-xs font-mono text-slate-500 line-through opacity-40 break-all">{action.sourcePath}</div>
      </div>
      <div className="space-y-1">
        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">To</span>
        <div className="text-xs font-mono text-emerald-400 font-black break-all">{action.targetPath}</div>
      </div>
    </div>
  </div>
);

const SearchCard: React.FC<{ action: Extract<AgentAction, { type: 'CodeSearch' }> }> = ({ action }) => {
  const [showResults, setShowResults] = useState(false);
  return (
    <div className="cyber-card mt-3 border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 hover:bg-amber-900/10 transition-colors cursor-pointer"
        onClick={() => setShowResults(!showResults)}
      >
        <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-500">
          <Search className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Contextual Exploration</h4>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
             <span className="text-xs font-black text-slate-100 bg-black/40 px-3 py-1 rounded-lg border border-amber-500/20 shadow-inner">"{action.query}"</span>
             {action.path && <span className="text-[10px] text-slate-500 italic font-medium">in {action.path}</span>}
             {action.results && (
               <span className="text-[9px] font-black text-amber-300/70 bg-amber-900/30 px-2 py-0.5 rounded-full">
                 {showResults ? 'Hide Results' : `${action.results.length} matches`}
               </span>
             )}
          </div>
        </div>
      </div>
      {showResults && action.results && (
        <div className="border-t border-amber-500/20 bg-black/40 p-4">
          <pre className="text-xs font-mono text-amber-200/80 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
            {typeof action.results === 'string' ? action.results : JSON.stringify(action.results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

const CodeReadCard: React.FC<{ action: Extract<AgentAction, { type: 'CodeRead' }> }> = ({ action }) => {
  const [showContent, setShowContent] = useState(false);
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-950/10 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-900/20 transition-colors cursor-pointer"
        onClick={() => setShowContent(!showContent)}
      >
        <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
           <BookOpen className="w-4 h-4" />
        </div>
        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Read Context</span>
        <span className="text-xs font-black text-emerald-200/90 font-mono truncate flex-1">{action.filePath}</span>
        {action.content && (
          <span className="text-[9px] font-black text-emerald-300/60 bg-emerald-900/30 px-2 py-0.5 rounded-full">
            {showContent ? 'Hide Content' : 'Show Content'}
          </span>
        )}
      </div>
      {showContent && action.content && (
        <div className="border-t border-emerald-500/20 bg-black/40 p-4">
          <pre className="text-xs font-mono text-emerald-200/80 whitespace-pre-wrap leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
            {action.content}
          </pre>
        </div>
      )}
    </div>
  );
};

const ThoughtCard: React.FC<{ action: Extract<AgentAction, { type: 'AgentThought' }> }> = ({ action }) => (
  <div className="mt-3 p-5 rounded-2xl bg-indigo-950/10 border border-indigo-500/10 backdrop-blur-sm shadow-inner">
    <div className="flex items-center gap-3 mb-3">
      <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
        <BrainCircuit className="w-5 h-5" />
      </div>
      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Agent Rationalization</span>
    </div>
    <div className="text-sm text-indigo-200/60 whitespace-pre-wrap pl-5 border-l-2 border-indigo-500/20 font-serif leading-relaxed italic">
      {action.text}
    </div>
  </div>
);

const ScreenCaptureCard: React.FC<{ action: Extract<AgentAction, { type: 'ScreenCapture' }> }> = ({ action }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (action.imageId) {
      getImage(action.imageId).then(data => {
        if (data) setImageUrl(`data:image/jpeg;base64,${data}`);
      });
    }
  }, [action.imageId]);

  return (
    <div className="mt-3 rounded-2xl border border-sky-500/30 bg-sky-950/20 overflow-hidden group/screen shadow-xl backdrop-blur-sm">
      <div className="bg-sky-900/30 px-4 py-2 flex items-center gap-3 border-b border-sky-500/20">
        <Monitor className="w-5 h-5 text-sky-400" />
        <span className="text-xs font-black text-sky-400 uppercase tracking-widest">Environment Snapshot</span>
      </div>
      <div className="p-4 flex flex-col items-center justify-center bg-black/40 relative min-h-[100px]">
        {imageUrl ? (
          <img src={imageUrl} alt="Screen capture" className="max-w-full rounded border border-sky-500/20 shadow-2xl" />
        ) : (
          <div className="text-sky-500/50 text-xs animate-pulse font-bold tracking-widest">Loading Snapshot Data...</div>
        )}
      </div>
    </div>
  );
};

const ComputerUseCard: React.FC<{ action: Extract<AgentAction, { type: 'ComputerUse' }> }> = ({ action }) => {
  return (
    <div className="mt-3 rounded-2xl border border-pink-500/30 bg-pink-950/20 overflow-hidden shadow-xl backdrop-blur-sm relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="bg-pink-900/30 px-4 py-3 flex items-center justify-between border-b border-pink-500/20 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-500/20 text-pink-400">
            <MousePointerClick className="w-5 h-5" />
          </div>
          <span className="text-xs font-black text-pink-400 uppercase tracking-widest">GUI Interaction</span>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded bg-black/40 text-pink-300 border border-pink-500/30">
          Action: {action.actionType}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-3 relative z-10">
        {action.coordinate && (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-20">Target (X, Y)</span>
            <div className="text-sm font-mono font-bold text-pink-300 bg-black/30 px-3 py-1.5 rounded-lg border border-pink-500/20 shadow-inner flex items-center gap-4">
               <span>[ {action.coordinate[0]} , {action.coordinate[1]} ]</span>
               <div className="relative w-4 h-4 flex items-center justify-center">
                 <div className="absolute w-1.5 h-1.5 bg-pink-500 rounded-full"></div>
                 <div className="absolute w-4 h-4 bg-pink-500/50 rounded-full animate-ping"></div>
               </div>
            </div>
          </div>
        )}
        
        {action.text && (
          <div className="flex items-start gap-3 mt-1">
             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest w-20 mt-1">Input Text</span>
             <div className="flex-1 bg-black/40 rounded-xl p-3 border border-pink-500/20 font-mono text-xs text-slate-300 shadow-inner break-all">
               {action.text}
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const UserImageCard: React.FC<{ action: Extract<AgentAction, { type: 'UserImage' }> }> = ({ action }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (action.imageId) {
      getImage(action.imageId).then(data => {
        if (data) setImageUrl(`data:image/jpeg;base64,${data}`);
      });
    }
  }, [action.imageId]);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 overflow-hidden shadow-xl backdrop-blur-sm">
      <div className="bg-emerald-900/30 px-4 py-2 flex items-center gap-3 border-b border-emerald-500/20">
        <ImageIcon className="w-5 h-5 text-emerald-400" />
        <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">User Uploaded Image</span>
      </div>
      <div className="p-4 flex flex-col items-center justify-center bg-black/40 min-h-[100px]">
        {imageUrl ? (
          <img src={imageUrl} alt="User upload" className="max-w-full rounded border border-emerald-500/20 shadow-2xl" />
        ) : (
          <div className="text-emerald-500/50 text-xs animate-pulse font-bold tracking-widest">Loading User Image...</div>
        )}
      </div>
    </div>
  );
};

// 新增：用户文本消息卡片
export const UserMessageCard: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="mt-3 rounded-2xl border border-sky-500/30 bg-sky-950/10 overflow-hidden shadow-lg">
      <div className="bg-sky-900/30 px-4 py-3 flex items-center gap-3 border-b border-sky-500/20">
        <MessageSquare className="w-5 h-5 text-sky-400" />
        <span className="text-xs font-black text-sky-400 uppercase tracking-widest">User Request</span>
      </div>
      <div className="p-5 bg-black/40">
        <div className="prose prose-invert prose-sm max-w-none text-sky-50/90 leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
};

// 新增：助手文本回复卡片
export const AssistantTextCard: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="mt-3 rounded-2xl border border-indigo-500/20 bg-indigo-950/10 overflow-hidden shadow-lg">
      <div className="bg-indigo-900/20 px-4 py-3 flex items-center gap-3 border-b border-indigo-500/20">
        <BrainCircuit className="w-5 h-5 text-indigo-400" />
        <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">Assistant Response</span>
      </div>
      <div className="p-5 bg-black/40">
        <div className="prose prose-invert prose-sm max-w-none text-indigo-50/90 leading-relaxed">
          {content}
        </div>
      </div>
    </div>
  );
};
