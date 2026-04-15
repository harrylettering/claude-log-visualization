# Claude Log Analyzer

<p align="center">
  <strong>Visual analytics for Claude Code session logs.</strong>
</p>

<p align="center">
  Turn Claude Code JSONL logs into timelines, token insights, agent-flow playback, prompt retrospectives, and session comparisons.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite 5" />
  <img src="https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
</p>

## Demo

https://github.com/user-attachments/assets/ab2f4640-be88-4c1f-aedf-dd353e46ef6a

## Why This Exists

Claude Code sessions can become long, tool-heavy, and hard to review from raw `.jsonl` files alone.
Claude Log Analyzer gives those sessions a visual interface so you can understand what happened, where tokens went, which tools were used, how the agent moved through the task, and what can be improved next time.

Use it to:

- Debug slow or noisy Claude Code sessions
- Review tool calls, tool results, and parent-child message structure
- Track token usage spikes across a session
- Replay agent workflows step by step
- Compare two sessions side by side
- Extract prompt and collaboration improvement ideas

## Highlights

- **Agent Flow Replay**: animated call-and-return visualization centered on `Main Agent`
- **Current Step Insight**: see who called whom and what happened at each step
- **Timeline Inspection**: searchable, expandable session timeline with rich event cards
- **Token Analytics**: per-request and aggregate token usage charts
- **AI Retrospective**: generate strengths, weaknesses, and next-step recommendations
- **Session Compare**: compare two Claude Code runs across messages, tokens, tools, and models

## Screenshots

### Core Dashboards

| Session Overview | Token Usage |
| --- | --- |
| ![Session Overview](docs/screenshots/session-overview.png) | ![Token Usage](docs/screenshots/token-usage.png) |

| Session Timeline | Conversation Flow |
| --- | --- |
| ![Session Timeline](docs/screenshots/session-timeline.png) | ![Conversation Flow](docs/screenshots/conversation-flow.png) |

| Session Compare | AI Analysis |
| --- | --- |
| ![Session Compare](docs/screenshots/session-compare.png) | ![AI Analysis](docs/screenshots/ai-analysis.png) |

### Agent Flow

| Tool Return to Main Agent | Assistant Return to Main Agent |
| --- | --- |
| ![Agent Flow Bash Return](docs/screenshots/agent-flow-bash.png) | ![Agent Flow Assistant Return](docs/screenshots/agent-flow-assistant.png) |

## Quick Start

### Requirements

- Node.js 18+
- npm

### Install

```bash
git clone https://github.com/harrylettering/claude-log-analyzer.git
cd claude-log-analyzer
npm install
```

### Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## How It Works

1. Load a Claude Code `.jsonl` session log.
2. The parser normalizes entries into messages, tool calls, token usage, parent-child relationships, and derived analysis data.
3. The UI exposes synchronized views so you can inspect the same session from different angles.
4. Analysis modules generate summaries, prompt guidance, and reusable collaboration patterns from the parsed session.

## Main Views

| View | What It Helps You Understand |
| --- | --- |
| Session Overview | High-level stats for messages, tokens, duration, models, and tool calls |
| Session Timeline | Chronological actions, searchable messages, diffs, and tool results |
| Agent Flow | Animated agent/tool call relationships and current-step context |
| Conversation Flow | Parent-child message hierarchy and conversation depth |
| Token Usage | Token trends, spikes, and per-request usage |
| AI Analysis | Retrospective insights and recommendations |
| Prompt Optimizer | Prompt quality review and improvement ideas |
| Session Compare | Side-by-side comparison across two sessions |
| Real-Time Log | Raw event stream inspection |

## Supported Log Data

The project is built around Claude Code session logs in `.jsonl` format.
Typical entries include:

- `user`
- `assistant`
- `system`
- tool-use and tool-result content blocks
- permission and metadata events
- file history snapshots

Common fields used by the parser include:

- `uuid`
- `parentUuid`
- `timestamp`
- `type`
- `message`
- `isSidechain`
- `isMeta`

## Tech Stack

- React 18
- TypeScript 5
- Vite 5
- Tailwind CSS 3
- Recharts
- Framer Motion
- Lucide React
- html2canvas
- Zustand
- XYFlow / React Flow

## Project Structure

```text
claude-log-analyzer/
├── docs/
│   └── screenshots/          # README demo images
├── src/
│   ├── components/           # UI modules and dashboards
│   ├── hooks/                # Playback and interaction hooks
│   ├── types/                # Domain types
│   ├── utils/                # Parsing, analysis, and data helpers
│   ├── App.tsx               # Application shell
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styling
├── package.json
└── README.md
```

## Roadmap

- Add a short Agent Flow demo GIF to the README hero section
- Provide anonymized sample logs for first-time users
- Improve large-session performance and virtualization
- Add more layout modes for complex agent/tool flows
- Add export presets for reports and retrospectives

## Development

```bash
npm run dev       # Start the Vite development server
npm run build     # Type-check and build for production
npm run preview   # Preview the production build locally
npm run lint      # Run ESLint
```

## Contributing

Contributions are welcome.
If you want to add a parser improvement, visualization, sample log, or UI polish, please open an issue or pull request with enough context to reproduce the behavior.

## License

MIT
