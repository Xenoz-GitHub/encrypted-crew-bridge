const MCP_SERVER = 'http://localhost:3100';
let connectionState = 'disconnected';
let healthInterval = null;
let healthListeners = new Set();

function broadcastState() {
  chrome.runtime.sendMessage({ action: 'connectionState', connected: connectionState === 'connected' }).catch(() => {});
}

async function checkHealth() {
  try {
    const res = await fetch(`${MCP_SERVER}/api/health`, {
      method: 'GET', signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      if (connectionState !== 'connected') {
        connectionState = 'connected';
        console.log('[ECB] MCP Server connected');
        broadcastState();
      }
      return true;
    }
  } catch (_) {}
  if (connectionState !== 'disconnected') {
    connectionState = 'disconnected';
    console.log('[ECB] MCP Server lost');
    broadcastState();
  }
  return false;
}

async function ensureConnection() {
  if (connectionState === 'connected') return true;
  return await checkHealth();
}

async function callTool(name, args) {
  await ensureConnection();
  const res = await fetch(`${MCP_SERVER}/api/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

// ── Service worker keepalive ────────────────────────────────────
function startHealthCheck() {
  if (healthInterval) return;
  checkHealth();
  healthInterval = setInterval(checkHealth, 15000);
}

function stopHealthCheck() {
  if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }
}

// Keep SW alive by fetching periodically
const KEEPALIVE_URLS = ['https://chat.deepseek.com', MCP_SERVER + '/api/health'];
async function keepAlive() {
  for (const url of KEEPALIVE_URLS) {
    try { await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) }); } catch (_) {}
  }
}

// ── Message handling ────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getConnectionState: () => { sendResponse({ connected: connectionState === 'connected' }); },

    startHealthCheck: () => { startHealthCheck(); sendResponse({ ok: true }); },
    stopHealthCheck: () => { stopHealthCheck(); sendResponse({ ok: true }); },

    saveCode: async () => {
      try {
        const result = await callTool('write_file', {
          project: message.project, filePath: message.filePath, content: message.text, raw: true,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    createCode: async () => {
      try {
        const result = await callTool('write_file', {
          project: message.project, filePath: message.filePath, content: message.text, raw: true,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    updateCode: async () => {
      try {
        const result = await callTool('write_file', {
          project: message.project, filePath: message.filePath, content: message.text, raw: true,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    deleteCode: async () => {
      try {
        const result = await callTool('delete_file', {
          project: message.project, filePath: message.filePath,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    readFile: async () => {
      try {
        const result = await callTool('read_file', {
          project: message.project, filePath: message.filePath,
        });
        sendResponse(result.isError ? { success: false, error: result.content?.[0]?.text } : { success: true, content: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    listFiles: async () => {
      try {
        const listResult = await callTool('list_projects', {});
        const text = listResult.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : [];
        var total = 0;
        parsed.forEach(function(p) { total += p.fileCount; });
        sendResponse({ success: true, projects: parsed, count: total });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    exportCode: async () => {
      try {
        const result = await callTool('export_file', {
          project: message.project, filePath: message.filePath, destination: message.destination,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    searchCode: async () => {
      try {
        const result = await callTool('search_files', {
          query: message.query, project: message.project,
          includeExt: message.includeExt, excludeDir: message.excludeDir,
        });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : [];
        sendResponse({ success: true, results: parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    treeFiles: async () => {
      try {
        const result = await callTool('read_dir', {
          project: message.project, subDir: message.subDir, depth: 4,
        });
        const text = result.content?.[0]?.text;
        const tree = text ? JSON.parse(text) : null;
        sendResponse({ success: true, tree });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    batchRead: async () => {
      try {
        const result = await callTool('batch_read', {
          project: message.project, filePaths: message.filePaths,
        });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : [];
        sendResponse({ success: true, results: parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    renameCode: async () => {
      try {
        const result = await callTool('rename_file', {
          project: message.project, oldPath: message.oldPath, newPath: message.newPath,
        });
        sendResponse({ success: !result.isError, error: result.content?.[0]?.text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    projectSummary: async () => {
      try {
        const result = await callTool('project_summary', { project: message.project });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        sendResponse({ success: true, summary: parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    readFileRange: async () => {
      try {
        const result = await callTool('read_file_range', {
          project: message.project, filePath: message.filePath,
          startLine: message.startLine, endLine: message.endLine,
        });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        sendResponse({ success: true, ...parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    patchCode: async () => {
      try {
        const result = await callTool('patch_file', {
          project: message.project, filePath: message.filePath, patches: message.patches,
        });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        sendResponse({ success: !result.isError, ...parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    gitCmd: async () => {
      try {
        const sub = message.gitAction;
        const toolMap = { status:'git_status', diff:'git_diff', commit:'git_commit', revert:'git_revert' };
        const tool = toolMap[sub] || 'git_status';
        const result = await callTool(tool, { project: message.project, filePath: message.filePath, message: message.message });
        const text = result.content?.[0]?.text;
        sendResponse({ success: !result.isError, output: text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    runTerminal: async () => {
      try {
        const result = await callTool('run_terminal', { command: message.command, project: message.project });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        sendResponse({ success: !result.isError, ...parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    undoOp: async () => {
      try {
        const result = await callTool('undo', { project: message.project, filePath: message.filePath });
        const text = result.content?.[0]?.text;
        const parsed = text ? JSON.parse(text) : null;
        sendResponse({ success: !result.isError, ...parsed });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    formatOp: async () => {
      try {
        const result = await callTool('format_file', { project: message.project, filePath: message.filePath });
        const text = result.content?.[0]?.text;
        sendResponse({ success: !result.isError, output: text });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    },

    checkConnection: async () => {
      sendResponse({ success: connectionState === 'connected' });
    },
  };

  const handler = handlers[message.action];
  if (handler) { handler(); return true; }
});

// ── Startup ─────────────────────────────────────────────────────
chrome.runtime.onStartup.addListener(() => startHealthCheck());
chrome.runtime.onInstalled.addListener(() => startHealthCheck());
startHealthCheck();

// Keep alive: ping every 20s so SW doesn't idle
setInterval(keepAlive, 20000);
