import type { AgentAction } from '../types/agent';
import type { LogEntry } from '../types/log';

export interface LoopWarning {
  type: 'LoopDetected';
  message: string;
  repeatedCommand?: string;
  failureCount: number;
}

// 检查给定的日志条目列表，找出是否存在死循环模式
export function detectLoop(entries: LogEntry[]): LoopWarning | null {
  // 我们只关心最近的 N 个包含有效 AgentAction 的条目
  const WINDOW_SIZE = 8;
  const recentActions: AgentAction[] = [];
  
  // 从后往前遍历，收集最近的动作
  for (let i = entries.length - 1; i >= 0; i--) {
    const action = entries[i].parsedAction;
    if (action) {
      // 忽略单纯的思考，我们关注实际的执行动作
      if (action.type !== 'AgentThought') {
         recentActions.push(action);
      }
    }
    if (recentActions.length >= WINDOW_SIZE) break;
  }

  // 恢复为正向时间序
  recentActions.reverse();

  // 模式 1：连续多次 TerminalCommand 失败，且命令相似
  const failedCommands = recentActions.filter(
    (a): a is Extract<AgentAction, { type: 'TerminalCommand' }> => 
      a.type === 'TerminalCommand' && a.exitCode !== 0 && a.exitCode !== -1
  );

  if (failedCommands.length >= 3) {
    // 检查最近 3 次失败是否是同一个命令（或高度相似）
    const lastThree = failedCommands.slice(-3);
    const cmd1 = lastThree[0].command.trim();
    const cmd2 = lastThree[1].command.trim();
    const cmd3 = lastThree[2].command.trim();

    // 简单匹配：完全相同，或者包含共同的核心词（如 npm test, pytest）
    if (cmd1 === cmd2 && cmd2 === cmd3) {
      return {
        type: 'LoopDetected',
        message: `Agent 似乎陷入了死循环。它已连续 3 次执行 "${cmd1}" 并遭遇失败。建议您立即在终端介入，分析报错并提供明确的修改思路。`,
        repeatedCommand: cmd1,
        failureCount: failedCommands.length
      };
    }
  }

  return null;
}
