# Encrypted Crew Bridge

<p>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js">
  <img src="https://img.shields.io/badge/built%20by-XenozExe-ff69b4?style=flat-square">
</p>

AI File Bridge for [DeepSeek Chat](https://chat.deepseek.com). Lets the AI read, write, edit, and manage your local project files through a browser extension + local MCP server.

## How It Works

```
DeepSeek Chat (browser)
  │
  ▼
Browser Extension (content.js)
  │ sends JSON commands from AI replies
  ▼
Background Script (background.js)
  │ relays to local server
  ▼
MCP Server (packages/mcp-server, port 3100)
  │ reads/writes/edits files, runs git, executes commands
  ▼
Your Project Files (local disk)
```

The AI sends commands as JSON in code blocks. The extension detects them, runs them against your local files, and sends the results back to the AI — creating a feedback loop where the AI can browse, edit, and manage your entire codebase autonomously.

## Quick Start

### 1. Start the Server
```bash
npm install
npm run dev
```

### 2. Load the Extension
1. Open `chrome://extensions/`
2. Enable Developer Mode (top right)
3. Click "Load unpacked" → select `browser-ext/`
4. Go to [chat.deepseek.com](https://chat.deepseek.com)

The bridge panel appears at the bottom of the chat. Click **Start** to begin.

### 3. Use It
Ask DeepSeek to work on your project. The AI will:
- List your project files
- Read/write/edit files
- Run git commands
- Execute terminal commands

All through natural language — the bridge handles the rest.

## Features
- **File operations** — read, write, edit, rename, delete
- **Git commands** — status, diff, commit, revert
- **Terminal** — run any command
- **Search** — search file contents across your project
- **Batch operations** — multiple commands per reply, parallel execution
- **File tree** — full directory listing
- **Zero config** — no API keys, no accounts, no payment

## Architecture

```
browser-ext/       Chrome/Edge extension (content script + background)
packages/mcp-server/  Local MCP server (Express + MCP SDK)
vscode-ext/        VS Code extension (optional)
```

## License

MIT — see [LICENSE](LICENSE)

---

Built by **XenozExe**.
