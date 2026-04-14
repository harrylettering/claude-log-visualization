import type { LogEntry } from '../types/log';
import type { AgentAction } from '../types/agent';

export interface Lesson {
  id: string;
  errorCommand: string;
  errorMessage: string;
  fixDescription: string;
  suggestedRule: string;
  severity: 'high' | 'medium' | 'low';
  entry?: LogEntry;
}

export function extractLessons(entries: LogEntry[]): Lesson[] {
  const lessons: Lesson[] = [];
  
  // 遍历寻找 [错误指令] -> [修复动作] -> [成功验证] 的模式
  for (let i = 0; i < entries.length - 2; i++) {
    const current = entries[i].parsedAction;
    
    // 1. 发现报错指令
    if (current?.type === 'TerminalCommand' && current.exitCode !== 0 && current.exitCode !== -1) {
      
      // 2. 寻找后续的 CodeWrite (修复动作)
      let fixAction: AgentAction | undefined;
      let fixIndex = -1;
      
      for (let j = i + 1; j < Math.min(i + 5, entries.length); j++) {
        if (entries[j].parsedAction?.type === 'CodeWrite') {
          fixAction = entries[j].parsedAction;
          fixIndex = j;
          break;
        }
      }
      
      // 3. 寻找修复后的成功验证
      if (fixAction && fixIndex !== -1) {
        let successFound = false;
        for (let k = fixIndex + 1; k < Math.min(fixIndex + 5, entries.length); k++) {
          const action = entries[k].parsedAction;
          if (action?.type === 'TerminalCommand' && action.exitCode === 0 && action.command === current.command) {
            successFound = true;
            break;
          }
        }
        
        if (successFound) {
          lessons.push({
            id: `lesson_${entries[i].uuid}`,
            errorCommand: current.command,
            errorMessage: current.stderr || current.output,
            fixDescription: (fixAction as any).instruction || 'Applied code changes',
            suggestedRule: `当运行 "${current.command}" 遇到类似错误时，应优先检查并执行: ${(fixAction as any).instruction || '对应的修复逻辑'}。`,
            severity: 'medium',
            entry: entries[i]
          });
        }
      }
    }
  }
  
  return lessons;
}
