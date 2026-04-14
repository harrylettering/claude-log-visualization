const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const os = require('os');

const CLAUDE_BASE_DIR = path.join(os.homedir(), '.claude', 'projects');

const { spawn, exec } = require('child_process');

// --- 经验沉淀提示词 (终端版) ---
const CLI_ANALYSIS_PROMPT = `你是一位顶级的 AI 协作专家。请阅读以下对话日志（已结构化压缩），并进行深度复盘。
请直接给出以下内容：
1. 协作总结：一句话概括表现。
2. 成功经验：哪些做法值得保持？
3. 避坑指南：哪些做法导致了低效或错误？
4. 优化建议：针对未来的 3 条具体改进方案。
请使用清晰的 Markdown 格式输出。`;

// --- 会话对比分析提示词 ---
const COMPARE_ANALYSIS_PROMPT = `你是一位顶级的 AI 协作专家。请对比分析以下两个对话会话，评估哪个效果更好并给出详细分析。

请直接给出以下内容：
1. **整体评估**：哪个会话效果更好？（A/B/平局）
2. **质量对比**：从回答准确性、效率、工具使用等维度对比
3. **差异分析**：两个会话的主要差异点
4. **建议**：针对本次对比的优化建议

请使用清晰的 Markdown 格式输出。对比时要有具体的数据支撑和明确的判断。`;

// --- 智能无损压缩函数 ---
function compressLogForAnalysis(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const originalSize = Buffer.byteLength(content, 'utf-8');

        const compressedLines = [];

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '未知时间';

                // 用户消息
                if (entry.type === 'user') {
                    let userText = '';
                    if (typeof entry.message?.content === 'string') {
                        userText = entry.message.content;
                    } else if (Array.isArray(entry.message?.content)) {
                        userText = entry.message.content
                            .filter(block => block.type === 'text')
                            .map(block => block.text)
                            .join('\n');
                    }
                    if (userText.trim()) {
                        compressedLines.push(`[${timestamp}] 用户: ${userText.trim()}`);
                    }
                    continue;
                }

                // AI消息
                if (entry.type === 'assistant') {
                    const contentBlocks = Array.isArray(entry.message?.content) ? entry.message.content : [];

                    // 提取thinking
                    const thinkingBlock = contentBlocks.find(block => block.type === 'thinking');
                    if (thinkingBlock?.thinking) {
                        const shortThinking = thinkingBlock.thinking.slice(0, 200) + (thinkingBlock.thinking.length > 200 ? '...' : '');
                        compressedLines.push(`[${timestamp}] AI思考: ${shortThinking}`);
                    }

                    // 提取工具调用
                    const toolUseBlocks = contentBlocks.filter(block => block.type === 'tool_use');
                    for (const toolUse of toolUseBlocks) {
                        const name = toolUse.name.toLowerCase();
                        const input = toolUse.input || {};

                        if (name === 'bash' || name === 'execute_command') {
                            const cmd = (input.command || input.script || '').trim();
                            compressedLines.push(`[${timestamp}] AI执行命令: ${cmd.slice(0, 300)}${cmd.length > 300 ? '...' : ''}`);
                        } else if (name === 'edit' || name === 'write' || name === 'str_replace_editor') {
                            const filePath = input.path || input.file_path || '未知文件';
                            const action = input.command === 'view' ? '查看文件' : '修改文件';
                            compressedLines.push(`[${timestamp}] AI${action}: ${filePath}`);
                        } else if (name === 'delete' || name === 'remove') {
                            const filePath = input.path || input.file_path || '未知文件';
                            compressedLines.push(`[${timestamp}] AI删除文件: ${filePath}`);
                        } else if (name === 'move' || name === 'rename' || name === 'mv') {
                            const from = input.source || input.from || '旧路径';
                            const to = input.destination || input.to || '新路径';
                            compressedLines.push(`[${timestamp}] AI重命名/移动: ${from} → ${to}`);
                        } else if (name === 'grep' || name === 'search' || name === 'find') {
                            const query = input.query || input.pattern || '';
                            compressedLines.push(`[${timestamp}] AI搜索: ${query}`);
                        } else if (name === 'view' || name === 'read_file' || name === 'glob' || name === 'list_files' || name === 'ls') {
                            const path = input.path || input.pattern || input.file_path || '';
                            compressedLines.push(`[${timestamp}] AI读取/列出文件: ${path}`);
                        } else if (name === 'computer' || name === 'computer_use') {
                            const action = input.action || '未知操作';
                            compressedLines.push(`[${timestamp}] AI操作电脑: ${action}`);
                        } else {
                            compressedLines.push(`[${timestamp}] AI调用工具: ${name}`);
                        }
                    }

                    // 提取文本回复
                    const textBlocks = contentBlocks.filter(block => block.type === 'text');
                    if (textBlocks.length > 0) {
                        const text = textBlocks.map(block => block.text).join('\n').trim();
                        if (text) {
                            compressedLines.push(`[${timestamp}] AI回复: ${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`);
                        }
                    }

                    // 工具结果（错误才记录）
                    if (Array.isArray(entry.message?.content)) {
                        const toolResultBlocks = entry.message.content.filter(block => block.type === 'tool_result' && block.is_error);
                        for (const result of toolResultBlocks) {
                            const errorContent = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
                            compressedLines.push(`[${timestamp}] 工具执行错误: ${errorContent.slice(0, 300)}${errorContent.length > 300 ? '...' : ''}`);
                        }
                    }
                }
            } catch (e) {
                // 忽略解析失败的行
                continue;
            }
        }

        const compressedContent = compressedLines.join('\n');
        const compressedSize = Buffer.byteLength(compressedContent, 'utf-8');
        const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

        console.log(`[压缩完成] 原始大小: ${(originalSize/1024).toFixed(1)}KB → 压缩后: ${(compressedSize/1024).toFixed(1)}KB → 压缩率: ${compressionRatio}%`);

        return compressedContent;
    } catch (e) {
        console.error('[压缩失败]', e);
        return null;
    }
}

// --- 扫描工具：增加排除逻辑与全路径显示 ---
function getRecentSessions() {
    if (!fs.existsSync(CLAUDE_BASE_DIR)) {
        return [];
    }
    
    const sessions = [];
    const now = Date.now();
    // 扩大检索范围到 1 小时，确保稳定性，同时避免展示过旧数据
    const SCAN_WINDOW = 24 * 60 * 60 * 1000;

    try {
        const projects = fs.readdirSync(CLAUDE_BASE_DIR);

        projects.forEach(project => {
            // 排除 subagents 文件夹
            if (project === 'subagents') return;

            const projectPath = path.join(CLAUDE_BASE_DIR, project);
            if (!fs.statSync(projectPath).isDirectory()) return;

            const files = fs.readdirSync(projectPath);
            files.forEach(file => {
                if (!file.endsWith('.jsonl')) return;
                
                const filePath = path.join(projectPath, file);
                try {
                    const stats = fs.statSync(filePath);
// 收集活跃会话
if (now - stats.mtimeMs <= SCAN_WINDOW) {
    sessions.push({
        id: file, // 完整的文件名
        folderName: project.replace(/^-Users-/, '').replace(/^-Users/, ''), // 去掉 -Users 前缀
        fullPath: filePath,
        lastUpdated: stats.mtime,
        size: (stats.size / 1024).toFixed(1) + ' KB'
    });
}
                } catch (e) {
                    // 忽略单个文件读取错误
                }
            });
        });
    } catch (err) {
        console.error('[Discovery] 扫描出错:', err);
    }

    // 按时间倒序
    return sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
}

// --- 监听器类 ---
class LogFileWatcher {
    constructor(ws) {
        this.ws = ws;
        this.watcher = null;
        this.currentPos = 0;
        this.activeFile = null;
    }

    watchPath(filePath) {
        if (this.watcher) this.watcher.close();
        this.activeFile = filePath;
        this.currentPos = 0; 

        console.log(`[Watcher] 开启实时监听: ${filePath}`);
        
        // 挂载监听
        this.watcher = chokidar.watch(filePath, { 
            persistent: true,
            ignoreInitial: false 
        });
        
        // 初始读取
        this.readNewLines();
        
        this.watcher.on('change', () => this.readNewLines());
    }

    readNewLines() {
        if (!this.activeFile || !fs.existsSync(this.activeFile)) return;
        const stats = fs.statSync(this.activeFile);
        
        if (stats.size > this.currentPos) {
            const stream = fs.createReadStream(this.activeFile, {
                start: this.currentPos,
                end: stats.size
            });

            let buffer = '';
            stream.on('data', (chunk) => {
                buffer += chunk.toString();
                if (buffer.includes('\n')) {
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    lines.forEach(line => {
                        if (line.trim()) {
                            this.sendToFrontend('log-entry', line);
                        }
                    });
                }
            });
            this.currentPos = stats.size;
        } else if (stats.size < this.currentPos) {
            this.currentPos = stats.size;
        }
    }

    sendToFrontend(type, payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
        }
    }

    stop() {
        if (this.watcher) this.watcher.close();
    }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    const watcher = new LogFileWatcher(ws);

    ws.on('message', (message) => {
        try {
            const { type, data } = JSON.parse(message);
            if (type === 'get-discovery-list') {
                const list = getRecentSessions();
                ws.send(JSON.stringify({ type: 'discovery-list', payload: list }));
            } else if (type === 'start-watch') {
                console.log(`[DEBUG] 收到 start-watch: ${data.path}`);
                watcher.watchPath(data.path);
            } else if (type === 'run-claude-analysis') {
                console.log('[DEBUG] 收到 run-claude-analysis 请求:', JSON.stringify(data));
                const targetPath = data?.path || watcher.activeFile;
                const customPrompt = data?.prompt;

                if (!targetPath) {
                    console.error('[DEBUG] 分析失败: 未提供有效路径');
                    ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: '未选择活跃文件且未提供路径' }));
                    return;
                }

                console.log(`[DEBUG] 确认分析路径: ${targetPath}`);
                console.log(`[DEBUG] 使用自定义prompt: ${customPrompt ? '是' : '否（使用默认）'}`);
                ws.send(JSON.stringify({ type: 'claude-analysis-start' }));

                try {
                    // 先压缩日志
                    const compressedContent = compressLogForAnalysis(targetPath);
                    if (!compressedContent) {
                        ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: '日志压缩失败，请检查文件是否可读' }));
                        return;
                    }

                    // 写临时文件
                    const tempFilePath = path.join(os.tmpdir(), `claude_compressed_${Date.now()}.txt`);
                    fs.writeFileSync(tempFilePath, compressedContent, 'utf-8');
                    console.log(`[临时文件] 已写入: ${tempFilePath}`);

                    // 使用自定义prompt或默认prompt
                    const finalPrompt = customPrompt || CLI_ANALYSIS_PROMPT;

                    // 用shell执行命令，和run_claude.sh逻辑一致
                    const command = `cat "${tempFilePath}" | claude -p "${finalPrompt.replace(/"/g, '\\"')}"`;
                    console.log(`[执行命令] ${command.slice(0, 200)}...`);

                    const claudeProcess = exec(command, { shell: '/bin/bash' });

                    let fullOutput = '';

                    claudeProcess.stdout.on('data', (chunk) => {
                        const text = chunk.toString();
                        fullOutput += text;
                        console.log(`[DEBUG] Claude Output: ${text.slice(0, 20)}...`);
                        ws.send(JSON.stringify({ type: 'claude-analysis-chunk', payload: text }));
                    });

                    claudeProcess.stderr.on('data', (chunk) => {
                        const text = chunk.toString();
                        console.error(`[DEBUG] Claude Stderr: ${text}`);
                        // 过滤掉一些常见的无用输出
                        if (!text.includes('Progress')) {
                            ws.send(JSON.stringify({ type: 'claude-analysis-chunk', payload: `\n[CLI Info]: ${text}` }));
                        }
                    });

                    claudeProcess.on('error', (err) => {
                        console.error('[DEBUG] Claude Process Error:', err);
                        // 清理临时文件
                        fs.unlinkSync(tempFilePath);
                        ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `启动 Claude 失败: ${err.message}。请确保已安装 claude cli 并在环境变量中。` }));
                    });

                    claudeProcess.on('close', (code) => {
                        console.log(`[DEBUG] Claude CLI 进程结束. Exit Code: ${code}`);
                        // 清理临时文件
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}

                        if (code !== 0 && !fullOutput) {
                            ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `分析进程异常退出 (Code: ${code})。请检查本地 claude 是否可用。` }));
                        } else {
                            ws.send(JSON.stringify({ type: 'claude-analysis-end', payload: fullOutput }));
                        }
                    });

                } catch (err) {
                    console.error('[DEBUG] Execution Exception:', err);
                    ws.send(JSON.stringify({ type: 'claude-analysis-error', payload: `执行异常: ${err.message}` }));
                }
            } else if (type === 'compare-sessions-analysis') {
                // 会话对比分析
                const { sessionA, sessionB } = data || {};
                console.log('[DEBUG] 收到 compare-sessions-analysis 请求');

                if (!sessionA || !sessionB) {
                    ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: '缺少会话数据' }));
                    return;
                }

                ws.send(JSON.stringify({ type: 'compare-analysis-start' }));

                try {
                    // 将两个会话内容拼接成对比格式
                    const compareContent = `【会话 A】\n${sessionA}\n\n【会话 B】\n${sessionB}`;

                    // 写临时文件
                    const tempFilePath = path.join(os.tmpdir(), `claude_compare_${Date.now()}.txt`);
                    fs.writeFileSync(tempFilePath, compareContent, 'utf-8');
                    console.log(`[临时文件] 已写入: ${tempFilePath}`);

                    // 用shell执行命令
                    const command = `cat "${tempFilePath}" | claude -p "${COMPARE_ANALYSIS_PROMPT.replace(/"/g, '\\"')}"`;
                    console.log(`[执行命令] ${command.slice(0, 200)}...`);

                    const claudeProcess = exec(command, { shell: '/bin/bash' });

                    let fullOutput = '';

                    claudeProcess.stdout.on('data', (chunk) => {
                        const text = chunk.toString();
                        fullOutput += text;
                        ws.send(JSON.stringify({ type: 'compare-analysis-chunk', payload: text }));
                    });

                    claudeProcess.stderr.on('data', (chunk) => {
                        const text = chunk.toString();
                        if (!text.includes('Progress')) {
                            ws.send(JSON.stringify({ type: 'compare-analysis-chunk', payload: `\n[CLI Info]: ${text}` }));
                        }
                    });

                    claudeProcess.on('error', (err) => {
                        console.error('[DEBUG] Claude Process Error:', err);
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}
                        ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `启动 Claude 失败: ${err.message}` }));
                    });

                    claudeProcess.on('close', (code) => {
                        console.log(`[DEBUG] Claude CLI 进程结束. Exit Code: ${code}`);
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}

                        if (code !== 0 && !fullOutput) {
                            ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `分析进程异常退出 (Code: ${code})` }));
                        } else {
                            ws.send(JSON.stringify({ type: 'compare-analysis-end', payload: fullOutput }));
                        }
                    });

                } catch (err) {
                    console.error('[DEBUG] Execution Exception:', err);
                    ws.send(JSON.stringify({ type: 'compare-analysis-error', payload: `执行异常: ${err.message}` }));
                }
            }
        } catch (e) { }
    });

    ws.on('close', () => watcher.stop());
});

const PORT = 4000;
server.listen(PORT, () => {
    console.log(`✅ Discovery Server Ready: http://localhost:${PORT}`);
});
