# Encrypted Crew Bridge

<p>
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=flat-square">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square&logo=node.js">
  <img src="https://img.shields.io/badge/built%20by-XenozExe-ff69b4?style=flat-square">
</p>

A 3-tier system that provides encrypted CRUD operations on code snippets via an MCP server, VS Code extension, and browser extension for [DeepSeek Chat](https://chat.deepseek.com).

## Architecture

```
browser-ext  ─┐
vscode-ext   ─┤──► MCP Server (packages/mcp-server, :3100)
               │       │
               │   AES-256-GCM encryption
               │       │
               │   WORKSPACE_ROOT (encrypted files)
               │       │
               │   Export ──► Real project folder (decrypted)
               │
          License Key Auth (admin panel)
```

## Quick Start

### Prerequisites
- Node.js >= 18
- Chrome/Edge (for the browser extension)
- VS Code (for the extension, optional)

### Setup & Run
```bash
# Windows
run.bat

# Unix
chmod +x scripts/setup.sh && ./scripts/setup.sh
```

### Configure
Copy `.env.example` to `.env` and set:
- `AES_KEY` — 64 hex characters (`openssl rand -hex 32`)
- `ADMIN_PASSWORD` — choose a strong password for the admin dashboard

### Load the Browser Extension
1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" → select `browser-ext/`
4. Navigate to `chat.deepseek.com`

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all project directories with file counts |
| `read_file` | Read and decrypt a file |
| `write_file` | Encrypt and write a file |
| `delete_file` | Delete an encrypted file |
| `encrypt_text` | Encrypt arbitrary text |
| `export_file` | Decrypt and export to a real project folder |
| `read_dir` | Show directory tree within a project |
| `search_files` | Search file contents across projects |
| `batch_read` | Read multiple files at once |
| `run_terminal` | Execute terminal commands |
| `git_status` / `git_diff` / `git_commit` / `git_revert` | Git operations |
| `patch_file` | Apply search/replace edits |
| `format_file` | Format a code file |
| `undo` | Undo last file change |

## Admin Dashboard

Open `http://localhost:3100/admin` to manage license keys, view server stats, and monitor activity logs.

## License Key System

The browser extension requires a valid license key. Keys are managed through the admin dashboard.

- **Lifetime** — Permanent access
- **One-Time** — Single use
- **Trial** — Time-limited (configurable hours)

## Security

- Files encrypted at rest with AES-256-GCM
- Path traversal attacks blocked by path sanitizer
- Rate limiting on all API endpoints
- Workspace root enforced for all file operations
- License keys bound to device ID

## License

MIT License — see [LICENSE](LICENSE)

---

Built by **XenozExe**.
