# Encrypted Crew Bridge

A 3-tier system that provides encrypted CRUD operations on code snippets via an MCP server, VS Code extension, and browser extension. Built by XenozExe.

## Complete Flow

### How Code Moves From AI Chat to Your Projects

```
1. DEEPSEEK (Browser)
   You find a code block from AI
          │
2. CREW BRIDGE PANEL (browser-ext/content.js)
   Click "Create" -- encrypts code with AES-256-GCM
          │
3. MCP SERVER (packages/mcp-server on port 3100)
   Receives encrypted data, stores it
          │
4. ENCRYPTED FILE (WORKSPACE_ROOT/project/)
   Saved as filename.txt.enc (JSON with ciphertext + iv + tag)
          │
5. RETRIEVAL OPTIONS:
   ├── Browser: Click "Read" to view decrypted content
   ├── VS Code: Use "Crew Bridge: Read Encrypted File" command
   └── Export:  Click "Export" to decrypt + write to real folder
```

### Example Scenario

1. You ask DeepSeek to write a React component
2. DeepSeek responds with a `<pre><code>` block
3. The Crew Bridge panel appears below it
4. Type `components/Button.tsx` → click **Create** → encrypted to `workspace/deepseek/components/Button.tsx.enc`
5. Later, click **Export** → enter `C:\MyReactProject\src\components\Button.tsx` → file is decrypted and written to your real project folder

### Projects vs Real Folders

| Concept | Path | Encrypted? |
|---------|------|------------|
| Crew Bridge "project" | `workspace/deepseek/` | Yes (.enc files) |
| Your real dev project | `C:\MyReactProject\` | No (plaintext) |

Use **Export** to bridge between them.

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

### 1. Prerequisites
- Node.js >= 18
- VS Code (for the extension)
- Chrome/Edge (for the browser extension)

### 2. Setup
```bash
# Windows
run.bat

# Unix
chmod +x scripts/setup.sh && ./scripts/setup.sh
```

### 3. Configure
Edit `.env`:
- `AES_KEY` — 64 hex characters (generate with `openssl rand -hex 32`)

- `WORKSPACE_ROOT` — directory for encrypted files (default: `./workspace`)

### 4. Run
```bash
cd packages/mcp-server
npm run dev
```

### 5. Load the Browser Extension
1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked" → select `browser-ext/`
4. Navigate to `chat.deepseek.com`

### 6. Debug the VS Code Extension
1. Open this repo in VS Code
2. Press F5 (uses `vscode-ext/.vscode/launch.json`)
3. Run commands from the Command Palette (`Ctrl+Shift+P`)

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all project directories |
| `read_file` | Read and decrypt a file |
| `write_file` | Encrypt and write a file |
| `delete_file` | Delete an encrypted file |
| `encrypt_text` | Encrypt arbitrary text |
| `export_file` | Decrypt and export to a real project folder |

## Admin Dashboard

Open `http://localhost:3100/admin` (or `/api/admin`) to see:
- Server status, uptime, port
- Project count
- Real-time log viewer (last 50 entries)
- Auto-refreshes every 5 seconds

Built by **XenozExe**.

## License Key System

The system requires a valid license key to use the browser extension.

**Pricing:** 100 PHP (Philippine Pesos) for a lifetime key.

### Key Types
- **Lifetime** — Permanent access, never expires
- **One-Time** — Single use, then deactivates

### Admin — Key Management
1. Start the server
2. Go to `http://localhost:3100/admin`
3. Login with the admin password from `.env` (default: `1346251346795846`)
4. Generate keys, copy them, and share with clients

### Client — How to Use
1. Install the browser extension
2. You'll see a lock screen asking for a license key
3. Enter your key (format: `XXXX-XXXX-XXXX-XXXX`)
4. The panel unlocks and you can save code encrypted to the server

## Security

- Files are encrypted at rest with AES-256-GCM
- Path traversal attacks are blocked by `pathSanitizer.ts`
- Rate limiting prevents abuse
- Workspace root is enforced for all file operations
