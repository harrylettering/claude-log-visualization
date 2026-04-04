
# Claude Log Visualization

Claude Code 日志可视化工具，帮助分析和理解 Claude Code 的会话日志。

## 功能特性

### 1. 会话概览
- 完整的会话统计信息
- Token 使用情况和成本估算
- 使用的模型列表
- 消息数量统计

### 2. 时间线视图
- 水平时间轴展示消息流
- 不同颜色区分消息类型
- 可展开查看详细内容
- 时间戳显示

### 3. Token 统计仪表板
- 每次请求的 Token 使用图表
- 累计 Token 使用曲线
- 输入/输出 Token 统计
- 成本估算

### 4. 工具使用分析
- 工具调用频率统计
- 工具执行时间分析
- 成功率统计
- 详细的工具输入输出查看

### 5. 文件历史
- 文件快照时间线
- 备份文件列表
- 变更历史记录

### 6. 对话流程图
- 树形结构展示消息层级
- 父子关系可视化
- Sidechain 分支显示

### 7. 性能分析
- 响应时间分布图
- 平均/最快/最慢响应统计
- 慢查询识别和警告

### 8. 实时日志流
- 原始日志流查看
- 搜索和过滤功能
- 自动滚动
- 支持加载新日志文件

### 9. 导出功能
- JSON 格式导出
- CSV 表格导出
- HTML 报告导出
- 原始 JSONL 导出

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览生产构建

```bash
npm run preview
```

## 使用说明

1. 启动应用后，点击或拖拽上传 Claude Code 日志文件（.jsonl 格式）
2. 使用左侧导航切换不同的可视化视图
3. 在各视图中探索和分析日志数据
4. 使用导出功能保存分析结果

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Recharts** - 图表库
- **Lucide React** - 图标库

## 日志格式

工具支持 Claude Code 生成的 JSONL 格式日志文件。每条日志是 JSON 对象，包含以下主要类型：

- `user` - 用户消息
- `assistant` - 助手消息
- `system` - 系统消息
- `file-history-snapshot` - 文件历史快照
- `permission-mode` - 权限模式

## 项目结构

```
claude-log-visualization/
├── src/
│   ├── components/          # React 组件
│   │   ├── FileUpload.tsx
│   │   ├── SessionOverview.tsx
│   │   ├── TimelineView.tsx
│   │   ├── TokenDashboard.tsx
│   │   ├── ToolAnalysis.tsx
│   │   ├── FileHistory.tsx
│   │   ├── ConversationFlow.tsx
│   │   ├── PerformanceView.tsx
│   │   ├── RealTimeLog.tsx
│   │   └── ExportPanel.tsx
│   ├── types/               # TypeScript 类型定义
│   │   └── log.ts
│   ├── utils/               # 工具函数
│   │   └── logParser.ts
│   ├── App.tsx              # 主应用组件
│   ├── main.tsx             # 应用入口
│   └── index.css            # 全局样式
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## 页面截图
<img width="1835" height="745" alt="image" src="https://github.com/user-attachments/assets/b9fa357b-fd04-40b2-ba95-c5825fe2b6cd" />




## 许可证

MIT
