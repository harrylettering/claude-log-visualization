export type AgentAction = {
  usage?: { input: number; output: number; total: number };
} & (
  | { type: 'CodeRead'; filePath: string; tokens: number; content?: string; preview?: string }
  | { type: 'CodeWrite'; filePath: string; diff?: string; before?: string; after?: string; instruction?: string }
  | { type: 'CodeDelete'; filePath: string; instruction?: string }
  | { type: 'CodeMove'; sourcePath: string; targetPath: string }
  | { type: 'CodeSearch'; query: string; path?: string; results?: string }
  | { type: 'TerminalCommand'; command: string; exitCode: number; output: string; stderr?: string }
  | { type: 'AgentThought'; text: string }
  | { type: 'ScreenCapture'; imageId: string; description?: string }
  | { type: 'ComputerUse'; actionType: string; coordinate?: [number, number]; text?: string; description?: string }
  | { type: 'UserImage'; imageId: string; description?: string }
  | { type: 'UserMessage'; content: string }
  | { type: 'AssistantText'; content: string }
  | { type: 'TaskCreate'; subject: string; description: string; activeForm?: string }
  | { type: 'TaskUpdate'; taskId: string; status?: string; subject?: string }
  | { type: 'TaskResult'; toolUseId: string; content: string; isError?: boolean }
  | { type: 'GenericToolCall'; name: string; input: any; description?: string }
);

export interface Span {
  id: string;
  timestamp: number;
  durationMs: number;
  tokenUsage: { input: number; output: number; cost: number };
  action: AgentAction;
}

// 扩展原始日志条目
export interface ActionEnhancedEntry {
  parsedAction?: AgentAction;
}
