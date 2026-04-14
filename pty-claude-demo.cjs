const pty = require('node-pty');
const fs = require('fs');

// 使用正则替代 strip-ansi 库，确保 100% 兼容性
const stripAnsi = (str) => {
    return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
};

function getShell() {
    const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'];
    for (const s of shells) {
        if (s && fs.existsSync(s)) return s;
    }
    return 'sh';
}

const SHELL = getShell();
console.log(`--- [PoC] PTY 自动化拦截深度验证 (免依赖版) ---`);
console.log(`[System] 已连接到后台 Shell: ${SHELL}`);
console.log(`[操作指引]：`);
console.log(`1. 输入命令测试双向通讯（如 ls）。`);
console.log(`2. 验证自动化：手动输入或粘贴下面这行并回车：`);
console.log(`   echo "1. Restore code and conversation"`);
console.log(`3. 观察：脚本是否会在 300ms 后自动帮你输入了 "1"？\n`);

// 启动 PTY
const ptyProcess = pty.spawn(SHELL, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env 
});

let buffer = '';

// 监听 PTY 输出并显示给用户
ptyProcess.onData((data) => {
  // 1. 原始输出展示给当前终端
  process.stdout.write(data);

  // 2. 自动化检测逻辑
  buffer += stripAnsi(data);
  
  // 检查是否包含特征文案
  if (/Restore code and conversation/i.test(buffer)) {
    console.log('\n\n[!!! 自动化触发 !!!] >>> 检测到目标菜单，正在代劳输入: 1');
    
    // 延迟 300ms 演示
    setTimeout(() => {
        ptyProcess.write('1\r');
        buffer = ''; // 重置 buffer
        console.log('[System] >>> 指令 "1" 已发送到后台 PTY。\n');
    }, 300);
  }
});

// 将用户的键盘输入传给 PTY
process.stdin.on('data', (data) => {
  ptyProcess.write(data);
});

ptyProcess.onExit(({ exitCode }) => {
  console.log(`\n[System] PTY 进程已退出。`);
  process.exit();
});
