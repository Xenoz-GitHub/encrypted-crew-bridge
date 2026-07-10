console.log('[ECB] content.js loaded (v2-zero)');

const DISCORD_INVITE = 'https://discord.gg/f5bSTzZtE6';
const FACEBOOK_URL = 'https://www.facebook.com/Zawn.Loid.SuwaRizz111';
const FACEBOOK_MESSENGER = 'https://m.me/Zawn.Loid.SuwaRizz111';

let agentState = 'locked';
let licenseKey = '';
let processedMessages = new Set();
let systemPromptSent = false;
let bridgePanel = null;
let agentLoopRunning = false;
let activeProject = 'bridge';
let knownProjects = [];
let savedDeviceId = null;
let savedDsEmail = null;
let _logEntries = [];
let _logPanelVisible = false;
let _ecbSending = false;
let _ecbSendTimer = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Device & Email helpers ──────────────────────────────────────
function getDeviceId() {
  if (savedDeviceId) return savedDeviceId;
  try {
    var id = localStorage.getItem('ecb_device_id');
    if (!id) {
      id = 'dvc-' + crypto.randomUUID().slice(0, 8) + '-' + Date.now().toString(36);
      localStorage.setItem('ecb_device_id', id);
    }
    savedDeviceId = id;
    return id;
  } catch (e) { return 'dvc-fallback-' + Math.random().toString(36).slice(2, 10); }
}

function getDeepSeekEmail() {
  if (savedDsEmail) return savedDsEmail;
  try {
    // Look for email-like text in profile/sidebar elements
    var all = document.querySelectorAll('[class*="email"], [class*="user"], [class*="profile"], [class*="account"], header, nav, aside, [class*="sidebar"]');
    for (var i = 0; i < all.length; i++) {
      var m = (all[i].textContent || '').match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) { savedDsEmail = m[1]; return m[1]; }
    }
    // Fallback: look for any email in the page
    var bodyMatch = document.body.textContent.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (bodyMatch) { savedDsEmail = bodyMatch[1]; return bodyMatch[1]; }
  } catch (e) {}
  return '';
}

function saveKeyData(key, deviceId, email) {
  try {
    chrome.storage.local.set({
      ecbLicenseKey: key,
      ecbDeviceId: deviceId,
      ecbDsEmail: email || '',
    });
  } catch (e) {}
}

function loadSavedKeyData() {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['ecbLicenseKey', 'ecbDeviceId', 'ecbDsEmail'], function(r) {
      if (r.ecbLicenseKey && r.ecbDeviceId) {
        resolve({ key: r.ecbLicenseKey, deviceId: r.ecbDeviceId, email: r.ecbDsEmail || '' });
      } else {
        resolve(null);
      }
    });
  });
}

function clearKeyData() {
  chrome.storage.local.remove(['ecbLicenseKey', 'ecbDeviceId', 'ecbDsEmail', 'ecbCustomPrompt']);
}

function saveCustomPrompt(text) {
  try { chrome.storage.local.set({ ecbCustomPrompt: text }); } catch (e) {}
}

function loadCustomPrompt() {
  return new Promise(function(resolve) {
    chrome.storage.local.get('ecbCustomPrompt', function(r) {
      resolve(r.ecbCustomPrompt || '');
    });
  });
}

function openFacebook() {
  window.open(FACEBOOK_URL, '_blank');
}

function openFacebookMsg() {
  window.open(FACEBOOK_MESSENGER, '_blank');
}

function openDiscord() {
  window.open(DISCORD_INVITE, '_blank');
}

// ── ZeroScript-style DOM helpers ─────────────────────────────────
const S = {
  chatItem: '.ds-message',
  userMod: 'd29f3d7d',
  userBubble: '.fbb737a4',
  box: '.ds-markdown',
  editor: 'textarea',
  thinking: '.ds-think-content',
  markdown: '.ds-markdown',
  generating: '.ds-loading',
  sendBtn: '.ds-button--primary',
  stopBtn: '.ds-button--primary',
};

function isUserItem(item) {
  if (!item) return false;
  if (S.userMod && item.classList.contains(S.userMod)) return true;
  if (S.userBubble && item.querySelector(S.userBubble)) return true;
  return false;
}
const isAssistantItem = (item) => !!item && !isUserItem(item);

function allItems() {
  var ds = document.querySelectorAll(S.chatItem);
  if (ds.length > 0) return [...ds];
  // Fallback: heuristic container scan (resilient to class changes)
  var containers = document.querySelectorAll('main, section, div:not([hidden])');
  var best = null, bestScore = 0;
  for (var ci = 0; ci < containers.length; ci++) {
    var el = containers[ci];
    var kids = el.children;
    if (kids.length < 2) continue;
    var score = 0;
    for (var ki = 0; ki < kids.length; ki++) {
      if ((kids[ki].textContent || '').trim().length > 30) score++;
    }
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.6 && r.bottom > window.innerHeight * 0.3 && r.width > 300) score += 3;
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (best) return [...best.children].filter(function(el) { return (el.textContent || '').trim().length > 5; });
  return [];
}
function assistantItems() { return allItems().filter(isAssistantItem); }
function userItems() { return allItems().filter(isUserItem); }
function assistantCount() { return assistantItems().length; }
function userCount() { return userItems().length; }
function lastAssistant() { const a = assistantItems(); return a.length ? a[a.length - 1] : null; }

function assistantText(item) {
  if (!item) return '';
  const mds = [...item.querySelectorAll(S.markdown)].filter((m) => !m.closest(S.thinking));
  return mds.map((m) => m.textContent).join("\n").trim();
}

function readAssistant() {
  const item = lastAssistant();
  if (!item) return { present: false, reply: '', thinking: '', item: null };
  const th = item.querySelector(`${S.thinking} ${S.markdown}`);
  const mds = [...item.querySelectorAll(S.markdown)].filter((m) => !m.closest(S.thinking));
  return {
    present: true,
    reply: mds.map(function(m) {
      var clone = m.cloneNode(true);
      clone.querySelectorAll('button, [class*="btn"], [class*="button"], [class*="copy"], [class*="download"], [class*="toolbar"], [class*="action"]').forEach(function(el) { el.remove(); });
      return clone.textContent;
    }).join("\n").trim(),
    thinking: th ? th.textContent.trim() : '',
    item,
  };
}

function getEditor() {
  for (const e of document.querySelectorAll(S.editor)) {
    if (!e.closest('#ecb-root')) return e;
  }
  return null;
}

function editorText() {
  const e = getEditor();
  if (!e) return '';
  return (e.value != null ? e.value : e.textContent || '');
}

// ── ZeroScript-style sending ─────────────────────────────────────
function setTextareaValue(el, v) {
  const proto = window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype;
  const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value');
  if (setter && setter.set) setter.set.call(el, v);
  else el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setInputLock(on) {
  const ed = getEditor();
  if (!ed) return;
  if (on) {
    if (!ed.dataset.ecbPlaceholder) ed.dataset.ecbPlaceholder = ed.getAttribute('placeholder') || '';
    ed.setAttribute('readonly', '');
    ed.setAttribute('placeholder', '\u23F3 Bridge working\u2026');
  } else {
    ed.removeAttribute('readonly');
    if (ed.dataset.ecbPlaceholder != null) ed.setAttribute('placeholder', ed.dataset.ecbPlaceholder);
  }
}

function isTextareaEmpty() {
  return editorText().trim().length === 0;
}

// ── Generation detection (ZeroScript-style) ──────────────────────
let _streamMax = -1, _streamAt = 0, _streamItem = null;

function streamText(item) {
  if (!item) return '';
  const think = item.querySelector(S.thinking);
  const thinkTxt = think ? think.textContent || '' : '';
  const replyTxt = [...item.querySelectorAll(S.markdown)]
    .filter((m) => !m.closest(S.thinking))
    .map((m) => m.textContent)
    .join('');
  return thinkTxt + '\n' + replyTxt;
}
const streamLen = (item) => streamText(item === undefined ? lastAssistant() : item).length;

function sampleStream() {
  const item = lastAssistant();
  const len = streamLen(item);
  const now = Date.now();
  if (item !== _streamItem || len < _streamMax - 400) {
    _streamItem = item; _streamMax = len; _streamAt = now; return;
  }
  if (len > _streamMax) { _streamMax = len; _streamAt = now; }
}
const grewWithin = (ms) => _streamMax > 1 && Date.now() - _streamAt < ms;

function isStopBtn(btn) {
  if (!btn) return false;
  if (btn.querySelector('rect')) return true;
  const p = btn.querySelector('path');
  if (!p) return false;
  return /^\s*M\s*[0-3][\s.]/.test(p.getAttribute('d') || '');
}

function isGenerating() {
  if (document.querySelector(S.generating)) return true;
  const btn = document.querySelector(S.sendBtn);
  if (isStopBtn(btn)) return true;
  sampleStream();
  return grewWithin(1200);
}

function isBusyNow() {
  if (document.querySelector(S.generating)) return true;
  const btn = document.querySelector(S.sendBtn);
  if (isStopBtn(btn)) return true;
  sampleStream();
  return grewWithin(1200);
}

function typeAndSend(text) {
  const editor = getEditor();
  if (!editor) return Promise.resolve(false);
  editor.focus();
  setTextareaValue(editor, text);
  return new Promise((resolve) => {
    let tries = 0;
    const maxTries = 30;
    const iv = setInterval(() => {
      tries++;
      const btn = document.querySelector(S.sendBtn);
      if (btn && btn.getAttribute('aria-disabled') !== 'true' && !isStopBtn(btn)) {
        btn.click();
        clearInterval(iv);
        setTimeout(() => resolve(true), 500);
      } else if (tries >= maxTries) {
        const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
        editor.dispatchEvent(new KeyboardEvent('keydown', o));
        editor.dispatchEvent(new KeyboardEvent('keyup', o));
        clearInterval(iv);
        setTimeout(() => resolve(true), 500);
      }
    }, 100);
  });
}

function sendTextLoop(attempts, text) {
  if (attempts <= 0) return Promise.resolve(false);
  _ecbSending = true;
  if (_ecbSendTimer) clearTimeout(_ecbSendTimer);
  return typeAndSend(text).then((ok) => {
    _ecbSendTimer = setTimeout(function() { _ecbSending = false; _ecbSendTimer = null; }, 300);
    if (ok) return text;
    return new Promise((r) => setTimeout(r, 500)).then(function() { return sendTextLoop(attempts - 1, text); });
  });
}

function sendText(text) {
  return sendTextLoop(3, text);
}

// ── ZeroScript-style send hooks ─────────────────────────────────
var _sendHooksInstalled = false;

function installSendHooks() {
  if (_sendHooksInstalled) return;
  _sendHooksInstalled = true;

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var ed = getEditor();
    if (!ed || !ed.contains(e.target)) return;
    var text = editorText().trim();
    if (text === '') return;

    // ECB is programmatically sending — never block
    if (_ecbSending) return;

    if (agentState === 'working' || agentState === 'starting') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (agentState === 'waiting') {
      return;
    }

    // User is sending during 'ready' — lock immediately to prevent spam
    if (agentState === 'ready' && agentLoopRunning) {
      agentState = 'working';
      setInputLock(true);
      updatePanel('working');
      return; // allow this one event through
    }
  }, true);

  document.addEventListener('click', function(e) {
    var ed = getEditor();
    if (!ed) return;
    // ECB is programmatically sending — never block
    if (_ecbSending) return;
    var btn = e.target.closest ? e.target.closest(S.sendBtn) : null;
    if (!btn) return;

    if (isStopBtn(btn)) {
      if (agentLoopRunning) {
        stopBridge();
      }
      return;
    }
    if (btn.getAttribute('aria-disabled') === 'true') return;

    if (agentState === 'working' || agentState === 'starting') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // User clicked send during 'ready' — lock immediately
    if (agentState === 'ready' && agentLoopRunning) {
      agentState = 'working';
      setInputLock(true);
      updatePanel('working');
      return; // allow this one click through
    }
  }, true);

  bridgeLog('Send hooks installed');
}

// ── Response watcher (ZeroScript-style) ──────────────────────────
const T = {
  GEN_IDLE_MS: 800,
  WARMUP_MS: 30000,
  STABLE_MS: 9000,
  GEN_STOP_GRACE_MS: 2500,
  RESPONSE_TIMEOUT_MS: 300000,
};

async function waitForResponse(timeout) {
  if (timeout === undefined) timeout = T.RESPONSE_TIMEOUT_MS;
  const t0 = Date.now();
  let lastActiveAt = Date.now();
  let started = false, doneSince = 0;
  let lastText = '', lastChangeAt = Date.now();
  let genFalseSince = 0;
  let preStartSilent = 0;
  let warmSince = 0, sawContent = false;

  while (Date.now() - lastActiveAt < timeout) {
    if (document.hidden) { await sleep(500); continue; }
    const gen = isGenerating();
    if (gen) lastActiveAt = Date.now();
    const d = readAssistant();
    if ((d.reply && d.reply.length) || (d.thinking && d.thinking.length)) sawContent = true;

    if (!started) {
      const hasText = !!((d.reply && d.reply.length) || (d.thinking && d.thinking.length));
      if (gen || hasText) { started = true; }
      else {
        if (!preStartSilent) preStartSilent = Date.now();
        if (Date.now() - preStartSilent > 60000) return { kind: 'empty' };
        await sleep(200);
        continue;
      }
    }

    const replyNorm = (d.reply || '').replace(/\s+/g, ' ').trim();
    if (replyNorm !== lastText) { lastText = replyNorm; lastChangeAt = Date.now(); lastActiveAt = Date.now(); }
    if (gen) genFalseSince = 0; else if (!genFalseSince) genFalseSince = Date.now();

    const stuckDone = started && d.reply && Date.now() - lastChangeAt > T.STABLE_MS;
    const genStopped = !gen && genFalseSince && Date.now() - genFalseSince > T.GEN_STOP_GRACE_MS;

    if ((gen || stuckDone) && !stuckDone) { doneSince = 0; await sleep(160); continue; }
    if (stuckDone && gen) console.log('[ECB] generating flag stuck - falling back to text stability');

    if (!doneSince) doneSince = Date.now();
    if (Date.now() - doneSince < 500) { await sleep(120); continue; }

    if (!sawContent) {
      if (!warmSince) warmSince = Date.now();
      if (Date.now() - warmSince < T.WARMUP_MS) { await sleep(200); continue; }
      return { kind: 'empty' };
    }

    // Check for JSON commands in the reply
    const r = d.reply || '';
    if (r.length > 0) {
      // Try to parse commands - if found, return tool call
      var actions = parseAllCommands(r);
      if (actions.length > 0) {
        return { kind: 'tool', text: r, actions: actions, item: d.item };
      }
    }

    if (r === '') return { kind: 'empty' };
    return { kind: 'text', text: r };
  }
  return { kind: 'timeout' };
}

// ── Robust user message detection ────────────────────────────────
// Count ECB-sent messages (those with data-ecb-marked). A genuine
// user message is any element WITHOUT our marker that appears after
// our marked messages, or any message at all if we haven't sent any yet.
function ecbSentCount() {
  try { return document.querySelectorAll('[data-ecb-marked]').length; } catch(e) { return 0; }
}

// Track the LAST assistant message ID seen. A new item that is NOT an
// assistant (not matching known assistant patterns) and NOT marked by
// ECB is a genuine user message. This avoids false triggers from AI
// responses to the system prompt.
var _lastAssistantSnapshot = null;

function updateAssistantSnapshot() {
  var items = allItems();
  // Find the last item that looks like an assistant message
  for (var i = items.length - 1; i >= 0; i--) {
    if (!items[i].hasAttribute('data-ecb-marked')) {
      var txt = (items[i].textContent || '').trim();
      // DeepSeek assistant messages typically contain .ds-markdown,.
      // We mark by: not having our badge AND looking assistant-like
      if (txt.length > 10) {
        _lastAssistantSnapshot = txt;
        return;
      }
    }
  }
  _lastAssistantSnapshot = null;
}

function hasNewUserMessage(initialEcbSent, initialTotal) {
  var items = allItems();
  var total = items.length;
  if (total <= initialTotal) return false;
  // Check if any unmarked item appeared since our last snapshot
  for (var i = initialTotal; i < total; i++) {
    if (i < items.length && !items[i].hasAttribute('data-ecb-marked')) {
      var txt = (items[i].textContent || '').trim();
      // Skip empty or very short items
      if (txt.length > 5) return true;
    }
  }
  return false;
}

async function waitForUserMessage(timeout) {
  if (timeout === undefined) timeout = 300000;
  var start = Date.now();
  var initialEcbSent = ecbSentCount();
  var initialTotal = allItems().length;
  while (Date.now() - start < timeout) {
    if (hasNewUserMessage(initialEcbSent, initialTotal)) {
      await sleep(500);
      return true;
    }
    await sleep(200);
  }
  return false;
}

// ── Message badge ────────────────────────────────────────────────
async function markLastSent() {
  await sleep(400);
  var items = allItems();
  if (items.length > 0) {
    var last = items[items.length - 1];
    if (last && !last.hasAttribute('data-ecb-marked')) {
      last.setAttribute('data-ecb-marked', 'true');
      var badge = last.querySelector('.ecb-bridge-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ecb-bridge-badge';
        badge.textContent = '\u2699';
        Object.assign(badge.style, {
          display:'inline-flex', alignItems:'center', justifyContent:'center',
          width:'16px', height:'16px', borderRadius:'50%',
          background:'rgba(99,102,241,0.12)', color:'#818cf8',
          fontSize:'10px', marginLeft:'6px', flex:'none',
          cursor:'default', title:'Bridge sent'
        });
        last.appendChild(badge);
      }
    }
  }
}

// ── Toast notification ───────────────────────────────────────────
function showToast(msg, type) {
  var existing = document.getElementById('ecb-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'ecb-toast';
  toast.textContent = msg;
  var colors = { info: '#6366f1', warn: '#f59e0b', error: '#ef4444', success: '#34d399' };
  var bg = colors[type] || colors.info;
  Object.assign(toast.style, {
    position:'fixed', top:'80px', left:'50%', transform:'translateX(-50%)',
    zIndex:'2147483646', padding:'8px 18px', borderRadius:'10px',
    background: bg, color:'#fff', fontFamily:'ui-sans-serif,sans-serif',
    fontSize:'13px', fontWeight:'600', boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
    opacity:'0', transition:'opacity 0.25s ease',
    pointerEvents:'none', whiteSpace:'nowrap', maxWidth:'80%',
    overflow:'hidden', textOverflow:'ellipsis'
  });
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.style.opacity = '1'; });
  setTimeout(function() {
    toast.style.opacity = '0';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// ── Styles (ZeroScript-inspired clean design) ────────────────────
const STYLES = [
  '@keyframes ecbPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); } 50% { box-shadow: 0 0 0 16px rgba(99,102,241,0); } }',
  '@keyframes ecbSpin { to { transform: rotate(360deg); } }',
  '@keyframes ecbSlideUp { from { opacity:0; transform:translateY(24px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }',
  '@keyframes ecbShimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }',
  '@keyframes ecbFadeIn { from { opacity:0; } to { opacity:1; } }',
  '@keyframes ecbGlowPulse { 0%,100% { opacity:0.4; } 50% { opacity:1; } }',
  '@keyframes ecbRot { to { transform: rotate(360deg); } }',
  '@keyframes ecbLive { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,0.55); } 100% { box-shadow: 0 0 0 7px rgba(52,211,153,0); } }',
  '.ecb-live-dot { animation: ecbLive 1.8s ease-out infinite; }',
  '.ecb-agent-working { animation:ecbShimmer 2.5s ease-in-out infinite; background:linear-gradient(90deg,transparent 0%,rgba(99,102,241,0.05) 50%,transparent 100%); background-size:200% 100%; }',
  '.ecb-agent-working::placeholder { color:rgba(99,102,241,0.6) !important; font-weight:600; letter-spacing:0.3px; }',
  '#ecb-bar { transition: opacity 0.25s ease, background 0.3s ease, border-color 0.3s ease; }',
  '#ecb-dot { transition: background 0.3s ease, box-shadow 0.3s ease; }',
  '#ecb-action { transition: filter 0.15s ease, background 0.15s ease; }',
  '#ecb-action:hover { filter: brightness(1.08); }',
  '#ecb-stop { transition: background 0.15s ease; }',
  '#ecb-stop:hover { background: rgba(220,38,38,0.15); }',
  '#ecb-state { transition: color 0.2s ease; }',
  'html.ecb-light #ecb-bar { background: rgba(249,250,253,0.97); border-color: rgba(99,102,241,0.25); color: #1f2430; box-shadow: 0 8px 30px rgba(15,23,42,0.12); }',
  'html.ecb-light #ecb-state { color: #4b5563; }',
  'html.ecb-light #ecb-state b { color: #4f46e5; }',
  'html.ecb-light #ecb-proj { color: rgba(79,70,229,0.5); border-color: rgba(99,102,241,0.1); }',
  'html.ecb-light #ecb-brand { color: rgba(31,36,48,0.7); }',
  'html.ecb-light #ecb-log-toggle { color: rgba(79,70,229,0.4); border-color: rgba(99,102,241,0.1); }',
  // Tool chips
  '@keyframes ecbChipSpin { to { transform: rotate(360deg); } }',
  '.ecb-tool-hide { display: none !important; }',
  '.ecb-whole-hidden > *:not(.ecb-chip) { display: none !important; }',
  '.ecb-chip { display: inline-flex; flex-direction: column; background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); border-radius: 8px; margin: 3px 0; font-family: ui-sans-serif,sans-serif; font-size: 12px; overflow: hidden; max-width: 100%; }',
  '.ecb-chip-head { display: flex; align-items: center; gap: 6px; padding: 4px 10px; color: #c8c8ce; user-select: none; }',
  '.ecb-chip-head .ecb-chip-ic { flex: none; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; }',
  '.ecb-chip-head .ecb-chip-ic svg { width: 14px; height: 14px; }',
  '.ecb-chip-head .ecb-chip-tx { flex: 0 1 auto; font-weight: 600; color: #e4e4ea; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  '.ecb-chip-head .ecb-chip-dt { flex: 0 1 auto; color: rgba(255,255,255,0.3); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-left: auto; }',
  '.ecb-chip-head .ecb-chip-cv { flex: none; color: rgba(255,255,255,0.2); font-size: 10px; margin-left: 6px; transition: transform 0.2s ease; }',
  '.ecb-chip.open .ecb-chip-head .ecb-chip-cv { transform: rotate(180deg); }',
  '.ecb-chip-body { display: none; max-height: 600px; overflow: auto; border-top: 1px solid rgba(99,102,241,0.1); }',
  '.ecb-chip-body pre { margin: 0; padding: 8px 10px; font-family: "JetBrains Mono","Fira Code",monospace; font-size: 11px; color: rgba(255,255,255,0.55); white-space: pre-wrap; word-break: break-all; }',
  '.ecb-chip.open .ecb-chip-body { display: block; }',
  '.ecb-chip-run .ecb-chip-ic { color: #818cf8; }',
  '.ecb-chip-done .ecb-chip-ic { color: #34d399; }',
  '.ecb-chip-err .ecb-chip-ic { color: #ef4444; }',
  '.ecb-chip-result .ecb-chip-ic { color: #f59e0b; }',
  '.ecb-chip-sys .ecb-chip-ic { color: #818cf8; }',
  '.ecb-chip-spin { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(99,102,241,0.2); border-top-color: #818cf8; border-radius: 50%; animation: ecbChipSpin 0.7s linear infinite; }',
  'html.ecb-light .ecb-chip { background: rgba(99,102,241,0.04); border-color: rgba(99,102,241,0.1); }',
  'html.ecb-light .ecb-chip-head { color: #6b7280; }',
  'html.ecb-light .ecb-chip-head .ecb-chip-tx { color: #374151; }',
  'html.ecb-light .ecb-chip-head .ecb-chip-dt { color: rgba(55,65,81,0.35); }',
  'html.ecb-light .ecb-chip-body pre { color: rgba(55,65,81,0.55); }',
].join('\n');

// Light mode detection
function detectLightMode() {
  var bg = window.getComputedStyle(document.body).backgroundColor;
  var rgb = bg.match(/\d+/g);
  if (rgb && rgb.length >= 3) {
    var lum = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
    if (lum > 128) document.documentElement.classList.add('ecb-light');
    else document.documentElement.classList.remove('ecb-light');
  }
}

// ── ECB Spinner ──────────────────────────────────────────────────
function ecbSpinner() {
  var s = document.createElement('span');
  s.className = 'ecb-spin';
  Object.assign(s.style, {
    display:'inline-block', width:'10px', height:'10px', flex:'none',
    border:'2px solid rgba(255,255,255,0.15)',
    borderTopColor:'#c8c8ce', borderRadius:'50%',
    animation:'ecbRot 0.7s linear infinite',
  });
  return s;
}

function injectStyles() {
  if (document.getElementById('ecb-styles')) return;
  detectLightMode();
  const s = document.createElement('style');
  s.id = 'ecb-styles';
  s.textContent = STYLES;
  document.head.appendChild(s);
}

// ── Startup wizard: step-by-step initialization ───────────────────
// Steps: validate key → connect MCP server → detect projects → init bridge
var startupWizard = null;
var startupSteps = {};

function createStartupWizard() {
  if (document.querySelector('.ecb-startup-wizard')) return;
  var logoUrl = 'https://i.ibb.co/v6JLQWHt/ecrew.png';
  var overlay = document.createElement('div');
  overlay.className = 'ecb-startup-wizard';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,2,12,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;animation:ecbFadeIn 0.35s ease';

  var card = document.createElement('div');
  card.style.cssText = 'background:rgba(10,10,22,0.75);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(0,200,255,0.12);border-radius:20px;padding:40px 36px;max-width:420px;width:90%;text-align:center;box-shadow:0 40px 80px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.04),0 0 60px rgba(0,180,255,0.06);animation:ecbSlideUp 0.4s cubic-bezier(0.16,1,0.3,1);position:relative;overflow:hidden';

  var glow = document.createElement('div');
  glow.style.cssText = 'position:absolute;top:-60%;left:-60%;width:220%;height:220%;background:radial-gradient(circle at 50% 50%,rgba(0,180,255,0.05) 0%,transparent 50%);pointer-events:none';
  card.appendChild(glow);

  card.innerHTML += [
    '<div style="margin-bottom:10px;position:relative">',
    '<img src="' + logoUrl + '" style="width:48px;height:48px;border-radius:12px;box-shadow:0 0 30px rgba(0,200,255,0.12)">',
    '</div>',
    '<h2 style="margin:0 0 2px;font-size:20px;font-weight:700;color:#ececf0;letter-spacing:-0.2px">Initializing Bridge</h2>',
    '<p style="color:rgba(255,255,255,0.25);font-size:11.5px;margin:0 0 24px">establishing connection & environment</p>',
    '<div id="ecb-step-list" style="text-align:left;padding:0 4px"></div>',
    '<div id="ecb-startup-error" style="color:#ff4060;font-size:12px;margin-top:14px;min-height:18px;display:none"></div>',
  ].join('\n');

  overlay.appendChild(card);
  document.body.appendChild(overlay);
  startupWizard = overlay;

  startupSteps = {
    'key':    { label: 'License validation', status: 'pending', el: null },
    'mcp':    { label: 'MCP server connection', status: 'pending', el: null },
    'proj':   { label: 'Project detection', status: 'pending', el: null },
    'cache':  { label: 'Environment analysis', status: 'pending', el: null },
    'ready':  { label: 'Bridge initialization', status: 'pending', el: null },
  };
  renderStepList();

  // Return reference for async orchestration
  return overlay;
}

function renderStepList() {
  var list = document.getElementById('ecb-step-list');
  if (!list) return;
  list.innerHTML = '';
  Object.keys(startupSteps).forEach(function(key) {
    var s = startupSteps[key];
    var el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;margin-bottom:2px;transition:all 0.2s';
    el.innerHTML = '<span class="ecb-step-icon" style="flex:none;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;transition:all 0.3s"></span><span style="flex:1;font-size:12px;color:' + (s.status === 'error' ? '#ff4060' : 'rgba(255,255,255,0.65)') + ';transition:color 0.3s">' + s.label + '</span>';
    list.appendChild(el);
    s.el = el;
    updateStepIcon(key);
  });
}

function setStep(key, status, msg) {
  if (!startupSteps[key]) return;
  startupSteps[key].status = status;
  startupSteps[key].msg = msg;
  if (startupSteps[key].el) updateStepIcon(key);
  // Error display
  var errEl = document.getElementById('ecb-startup-error');
  if (errEl) {
    if (status === 'error' && msg) {
      errEl.textContent = msg;
      errEl.style.display = '';
    } else if (status !== 'error') {
      errEl.style.display = 'none';
    }
  }
}

function updateStepIcon(key) {
  var s = startupSteps[key];
  if (!s || !s.el) return;
  var icon = s.el.querySelector('.ecb-step-icon');
  if (!icon) return;
  var lbl = s.el.querySelector('span:last-child');
  switch (s.status) {
    case 'done':
      icon.textContent = '\u2713';
      icon.style.background = 'rgba(0,255,148,0.15)';
      icon.style.color = '#00ff94';
      icon.style.boxShadow = '0 0 12px rgba(0,255,148,0.2)';
      if (lbl) lbl.style.color = 'rgba(255,255,255,0.8)';
      break;
    case 'active':
      icon.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" style="animation:ecbSpin 0.8s linear infinite"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31.4" stroke-dashoffset="10" stroke-linecap="round"/></svg>';
      icon.style.background = 'rgba(0,200,255,0.12)';
      icon.style.color = '#00c8ff';
      icon.style.boxShadow = '0 0 12px rgba(0,200,255,0.15)';
      if (lbl) lbl.style.color = '#00c8ff';
      break;
    case 'error':
      icon.textContent = '\u2717';
      icon.style.background = 'rgba(255,50,50,0.15)';
      icon.style.color = '#ff4060';
      icon.style.boxShadow = '0 0 12px rgba(255,50,50,0.2)';
      if (lbl) lbl.style.color = '#ff4060';
      break;
    default: // pending
      icon.textContent = '\u25CB';
      icon.style.background = 'rgba(255,255,255,0.04)';
      icon.style.color = 'rgba(255,255,255,0.2)';
      icon.style.boxShadow = 'none';
      if (lbl) lbl.style.color = 'rgba(255,255,255,0.35)';
  }
}

function closeStartupWizard() {
  if (startupWizard && startupWizard.parentNode) startupWizard.remove();
  startupWizard = null;
  startupSteps = {};
}

// ── Enhanced project detection with caching & fallbacks ──────────
async function detectProject() {
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem('ecb_projects')); } catch(e) {}

  var res;
  // Attempt primary MCP call with retry
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      res = await sendMCP('listFiles', {});
      if (res && res.success) break;
    } catch(e) {}
    await sleep(800 * (attempt + 1));
  }

  if (res && res.success && res.projects && res.projects.length > 0) {
    knownProjects = res.projects.map(function(p) { return p.name; });
    // Cache for offline/instant load
    try { localStorage.setItem('ecb_projects', JSON.stringify(knownProjects)); } catch(e) {}
    // Pick first project, or restore previous from cache
    var prev = localStorage.getItem('ecb_active_project');
    if (prev && knownProjects.indexOf(prev) !== -1) {
      activeProject = prev;
    } else {
      activeProject = knownProjects[0];
    }
    return { success: true, projects: knownProjects, active: activeProject };
  }

  // Fallback: use cached projects
  if (cached && cached.length > 0) {
    knownProjects = cached;
    activeProject = cached[0];
    return { success: true, projects: cached, active: cached[0], cached: true };
  }

  // Last resort: hardcoded fallback (bridge should always exist)
  knownProjects = ['bridge'];
  activeProject = 'bridge';
  return { success: false, projects: ['bridge'], active: 'bridge', fallback: true };
}

// ── Main startup orchestration ────────────────────────────────────
async function startupSequence(key, skipWizard) {
  installSendHooks();
  if (skipWizard) {
    // Fast path: key already validated, go straight to bridge
    licenseKey = key;
    injectStyles();
    createBridgePanel();
    updatePanel('ready');
    agentState = 'ready';
    startAgent();
    return;
  }

  var overlay = createStartupWizard();
  if (!document.getElementById('ecb-styles')) injectStyles();

  // Step 1: Validate license key
  setStep('key', 'active');
  var deviceId = getDeviceId();
  var email = getDeepSeekEmail();
  var keyResult = await validateKeyWithRetry(key, 3, deviceId, email);
  if (!keyResult.valid) {
    setStep('key', 'error', keyResult.reason || 'invalid key');
    closeStartupWizard();
    createAuthModal();
    return;
  }
  setStep('key', 'done', 'License validated');
  licenseKey = key;
  saveKeyData(key, deviceId, email);

  // Step 2: Connect to MCP server
  setStep('mcp', 'active');
  var mcpOk = await checkMCPConnection(5);
  if (!mcpOk) {
    setStep('mcp', 'error', 'Server unreachable (localhost:3100)');
    closeStartupWizard();
    clearKeyData();
    createAuthModal();
    return;
  }
  setStep('mcp', 'done', 'MCP server reachable');

  // Step 3: Detect projects
  setStep('proj', 'active');
  var projResult = await detectProject();
  if (projResult.success) {
    setStep('proj', 'done', projResult.cached ? 'Projects loaded (cached)' : 'Projects detected: ' + knownProjects.join(', '));
  } else if (projResult.fallback) {
    setStep('proj', 'done', 'Using fallback project');
  } else {
    setStep('proj', 'done', 'Using default project');
  }

  // Step 4: Analyze environment
  setStep('cache', 'active');
  await analyzeEnvironment();
  setStep('cache', 'done', 'Environment ready');

  // Step 5: Initialize bridge
  setStep('ready', 'active', 'Building interface...');
  injectStyles();
  createBridgePanel();
  updatePanel('ready');
  agentState = 'ready';

  setStep('ready', 'done', 'Ready!');

  // Show launch button
  overlay.innerHTML += [
    '<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.04)">',
    '<button id="ecbStartBtn2" style="width:100%;background:linear-gradient(135deg,#00c8ff,#00ff94);color:#000;border:none;border-radius:12px;padding:12px;font-size:13px;cursor:pointer;font-weight:700;letter-spacing:0.3px;transition:transform 0.15s,box-shadow 0.25s;box-shadow:0 4px 24px rgba(0,200,255,0.3)">Launch Bridge</button>',
    '</div>'
  ].join('\n');

  document.getElementById('ecbStartBtn2').addEventListener('click', function() {
    closeStartupWizard();
    startAgent();
  });
}

function validateKeyWithRetry(key, maxRetries, deviceId, email) {
  return new Promise(function(resolve) {
    var attempts = 0;
    var timedOut = false;
    var timer = setTimeout(function() { timedOut = true; resolve({ valid: false, reason: 'timeout' }); }, 10000);
    function tryValidate() {
      attempts++;
      chrome.runtime.sendMessage({
        action: 'validateKey',
        key: key,
        deviceId: deviceId || getDeviceId(),
        email: email || getDeepSeekEmail(),
      }, function(response) {
        if (timedOut) return;
        clearTimeout(timer);
        if (response && response.valid) {
          resolve({ valid: true });
        } else if (response && response.reason === 'Server unreachable' && attempts < maxRetries) {
          timer = setTimeout(function() { timedOut = true; resolve({ valid: false, reason: 'timeout' }); }, 10000);
          setTimeout(tryValidate, 2000);
        } else {
          resolve({ valid: false, reason: response ? (response.reason || 'invalid key') : 'no response', expired: response && response.expired });
        }
      });
    }
    tryValidate();
  });
}

function checkMCPConnection(maxRetries) {
  return new Promise(function(resolve) {
    var attempts = 0;
    var timedOut = false;
    var timer = setTimeout(function() { timedOut = true; resolve(false); }, 10000);
    function tryPing() {
      attempts++;
      chrome.runtime.sendMessage({ action: 'checkConnection' }, function(response) {
        if (timedOut) return;
        if (response && response.success) {
          clearTimeout(timer);
          resolve(true);
        } else if (attempts < maxRetries) {
          setTimeout(tryPing, 1500);
        } else {
          clearTimeout(timer);
          resolve(false);
        }
      });
    }
    tryPing();
  });
}

async function analyzeEnvironment() {
  try {
    var total = allItems().length;
    var user = userItems().length;
    var assistant = assistantItems().length;
    localStorage.setItem('ecb_env', JSON.stringify({
      chatType: 'ds-message',
      messages: total,
      users: user,
      assistants: assistant,
      timestamp: Date.now()
    }));
  } catch(e) {}
}

// ── Auth UI (Professional Paywall) ─────────────────────────────
function createAuthModal() {
  if (document.querySelector('.ecb-auth-modal')) return;
  var logoUrl = 'https://i.ibb.co/v6JLQWHt/ecrew.png';
  var detectedEmail = getDeepSeekEmail();

  const overlay = document.createElement('div');
  overlay.className = 'ecb-auth-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(2,2,12,0.92);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;animation:ecbFadeIn 0.35s ease';

  const card = document.createElement('div');
  card.style.cssText = 'background:rgba(10,10,22,0.75);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(0,200,255,0.12);border-radius:20px;padding:36px 32px;max-width:400px;width:92%;text-align:center;box-shadow:0 40px 80px rgba(0,0,0,0.6),inset 0 1px 0 rgba(255,255,255,0.04),0 0 60px rgba(0,180,255,0.06);animation:ecbSlideUp 0.4s cubic-bezier(0.16,1,0.3,1);position:relative;overflow:hidden';

  const glow = document.createElement('div');
  glow.style.cssText = 'position:absolute;top:-60%;left:-60%;width:220%;height:220%;background:radial-gradient(circle at 50% 50%,rgba(0,180,255,0.05) 0%,transparent 50%);pointer-events:none';
  card.appendChild(glow);

  // Build inner HTML with SVG icons (no emojis)
  var fbSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
  var discordSvg = '<svg width="14" height="14" viewBox="0 0 127.14 96.36" fill="#5865f2"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36a77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';
  var keySvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.85 12.15L19 4"/><path d="M18 5l2 2"/><path d="M15 8l2 2"/></svg>';
  var checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ff94" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var lockSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var mailSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';

  card.innerHTML += [
    '<div style="margin-bottom:10px;position:relative">',
    '<img src="' + logoUrl + '" style="width:48px;height:48px;border-radius:12px;box-shadow:0 0 30px rgba(0,200,255,0.12)">',
    '</div>',
    '<h2 style="margin:0 0 2px;font-size:20px;font-weight:700;color:#ececf0;letter-spacing:-0.2px">Crew Bridge</h2>',
    '<p style="color:rgba(255,255,255,0.25);font-size:11.5px;margin:0 0 18px;letter-spacing:0.2px">AI File Bridge for DeepSeek Chat</p>',

    // Pricing card
    '<div style="background:linear-gradient(135deg,rgba(0,200,255,0.06),rgba(0,255,148,0.04));border:1px solid rgba(0,200,255,0.12);border-radius:12px;padding:14px;margin-bottom:16px">',
    '<div style="display:flex;align-items:baseline;justify-content:center;gap:2px">',
    '<span style="font-size:24px;font-weight:800;color:#ececf0;letter-spacing:-0.5px">\u20B1</span>',
    '<span style="font-size:32px;font-weight:800;color:#ececf0;letter-spacing:-1px">100</span>',
    '<span style="font-size:12px;font-weight:400;color:rgba(255,255,255,0.3);margin-left:2px">/ month</span>',
    '</div>',
    '<div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;margin-top:10px">',
    '<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,0.45)">' + checkSvg + ' All features</span>',
    '<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,0.45)">' + checkSvg + ' Lifetime access</span>',
    '<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,0.45)">' + checkSvg + ' Device-bound</span>',
    '</div></div>',

    // Get Key section
    '<div id="ecbGetKeySection" style="margin-bottom:14px">',
    '<button id="ecbGetKeyBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;background:linear-gradient(135deg,#0066ff,#00c8ff);color:#fff;border:none;border-radius:12px;padding:13px;font-size:13px;cursor:pointer;font-weight:700;letter-spacing:0.3px;transition:transform 0.15s,box-shadow 0.25s;box-shadow:0 4px 20px rgba(0,150,255,0.3)">' + keySvg + ' Get Your License Key</button>',
    '<div style="display:none;gap:8px;margin-top:8px">',
    '<button id="ecbFbBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1;background:rgba(24,119,242,0.1);color:#8ab4f8;border:1px solid rgba(24,119,242,0.18);border-radius:8px;padding:8px;font-size:11px;cursor:pointer;font-weight:600;transition:all 0.15s">' + fbSvg + ' Facebook</button>',
    '<button id="ecbDiscordBtn" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1;background:rgba(88,101,242,0.1);color:#818cf8;border:1px solid rgba(88,101,242,0.18);border-radius:8px;padding:8px;font-size:11px;cursor:pointer;font-weight:600;transition:all 0.15s">' + discordSvg + ' Discord</button>',
    '</div>',
    '<p style="color:rgba(255,255,255,0.2);font-size:10px;margin:6px 0 0;letter-spacing:0.2px">Or contact us for a free 5-hour trial key</p>',
    '</div>',

    // Divider
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">',
    '<div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>',
    '<span style="color:rgba(255,255,255,0.12);font-size:10px;letter-spacing:0.8px;text-transform:uppercase;font-weight:500">Already have a key?</span>',
    '<div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>',
    '</div>',

    // Key input section
    '<div style="position:relative;margin-bottom:10px">',
    (detectedEmail ? '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding:6px 10px;background:rgba(0,200,255,0.04);border:1px solid rgba(0,200,255,0.06);border-radius:8px;font-size:10.5px;color:rgba(255,255,255,0.25);text-align:left">' + mailSvg + ' <span style="color:rgba(255,255,255,0.2)">Detected account:</span> <span style="color:rgba(0,200,255,0.5)">' + detectedEmail + '</span></div>' : '') +
    '<input id="ecbKeyInput" type="text" placeholder="License key" autocomplete="off" spellcheck="false"',
    ' style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.4);border:1.5px solid rgba(0,200,255,0.10);border-radius:10px;padding:12px 14px;color:#e0e0e8;font-size:13px;font-family:inherit;outline:none;transition:border-color 0.2s,box-shadow 0.2s;text-align:center;letter-spacing:1.5px;caret-color:#00c8ff">',
    '</div>',
    '<button id="ecbAuthBtn"',
    ' style="width:100%;box-sizing:border-box;background:rgba(0,200,255,0.08);color:#00c8ff;border:1px solid rgba(0,200,255,0.15);border-radius:10px;padding:12px;font-size:12px;cursor:pointer;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;transition:all 0.2s">Activate Bridge</button>',
    '<div id="ecbAuthError" style="color:#ff4060;font-size:11px;margin-top:10px;min-height:16px"></div>',
    '<div id="ecbStartSection" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.04)">',
    '<div style="display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,0.35);font-size:11px;margin-bottom:12px">' + checkSvg + ' Key validated &mdash; ready to launch</div>',
    '<button id="ecbStartBtn"',
    ' style="width:100%;background:linear-gradient(135deg,#00c8ff,#00ff94);color:#000;border:none;border-radius:10px;padding:12px;font-size:13px;cursor:pointer;font-weight:700;letter-spacing:0.4px;transition:transform 0.15s,box-shadow 0.25s;box-shadow:0 4px 24px rgba(0,200,255,0.3)">Launch Bridge</button>',
    '</div>',

    // Custom Instructions
    '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.03)">',
    '<div style="display:flex;align-items:center;justify-content:center;gap:6px;color:rgba(255,255,255,0.2);font-size:10.5px;letter-spacing:0.4px;margin-bottom:6px">Custom Instructions</div>',
    '<textarea id="ecbCustomInput" placeholder="Describe how the AI should behave, coding style preferences, project conventions, or any specific instructions you want applied on every startup."',
    ' style="width:100%;background:rgba(0,0,0,0.3);border:1px solid rgba(0,200,255,0.08);border-radius:8px;padding:10px;color:rgba(255,255,255,0.55);font-size:11px;font-family:inherit;outline:none;resize:vertical;min-height:50px;max-height:120px;transition:border-color 0.2s;line-height:1.5"></textarea>',
    '</div>',

    // Footer
    '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.02)">',
    '<div style="display:flex;justify-content:center;gap:16px;font-size:9.5px;color:rgba(255,255,255,0.1);letter-spacing:0.3px">',
    '<span style="display:flex;align-items:center;gap:4px">' + lockSvg + ' Device-bound</span>',
    '<span style="display:flex;align-items:center;gap:4px">' + lockSvg + ' Saved locally</span>',
    '<span id="ecbAuthNewSession" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:rgba(0,200,255,0.35);transition:color 0.2s" title="Start a new chat session">&#65291; New Session</span>',
    '</div></div>',
  ].join('\n');

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // ── References ──
  var input = document.getElementById('ecbKeyInput');
  var btn = document.getElementById('ecbAuthBtn');
  var err = document.getElementById('ecbAuthError');
  var startSection = document.getElementById('ecbStartSection');
  var startBtn = document.getElementById('ecbStartBtn');
  var getKeyBtn = document.getElementById('ecbGetKeyBtn');
  var fbBtn = document.getElementById('ecbFbBtn');
  var discordBtn = document.getElementById('ecbDiscordBtn');
  var customInput = document.getElementById('ecbCustomInput');

  // ── Social buttons ──
  getKeyBtn.addEventListener('click', function() {
    // Show submenu with Facebook/Discord
    getKeyBtn.style.display = 'none';
    fbBtn.parentElement.style.display = 'flex'; // show social row
    fbBtn.parentElement.style.animation = 'ecbFadeIn 0.2s ease';
  });

  fbBtn.addEventListener('click', openFacebook);
  discordBtn.addEventListener('click', openDiscord);

  // ── Load saved custom prompt ──
  loadCustomPrompt().then(function(t) { if (t) customInput.value = t; }).catch(function(){});

  // ── New Session ──
  var authNewSession = document.getElementById('ecbAuthNewSession');
  if (authNewSession) {
    authNewSession.addEventListener('click', function(e) {
      e.stopPropagation();
      window.location.href = 'https://chat.deepseek.com/';
    });
    authNewSession.addEventListener('mouseenter', function() { this.style.color = 'rgba(0,200,255,0.7)'; });
    authNewSession.addEventListener('mouseleave', function() { this.style.color = 'rgba(0,200,255,0.35)'; });
  }

  // ── Hover effects ──
  function addHover(el, shadowColor) {
    el.addEventListener('mouseenter', function() {
      el.style.transform = 'translateY(-1px) scale(1.01)';
      el.style.boxShadow = '0 6px 24px ' + shadowColor;
    });
    el.addEventListener('mouseleave', function() {
      el.style.transform = 'none';
      el.style.boxShadow = getKeyBtn.contains(el) ? '0 4px 20px rgba(0,150,255,0.3)' : 'none';
    });
  }
  addHover(getKeyBtn, 'rgba(0,150,255,0.35)');
  addHover(startBtn, 'rgba(0,200,255,0.35)');

  // ── Input focus ──
  input.addEventListener('focus', function() {
    input.style.borderColor = '#00c8ff';
    input.style.boxShadow = '0 0 0 3px rgba(0,200,255,0.10), 0 0 20px rgba(0,200,255,0.03)';
  });
  input.addEventListener('blur', function() {
    input.style.borderColor = 'rgba(0,200,255,0.10)';
    input.style.boxShadow = 'none';
  });

  // ── Auth ──
  function doAuth() {
    var key = input.value.trim();
    if (!key) { err.textContent = 'Enter your license key'; return; }
    var deviceId = getDeviceId();
    var email = detectedEmail || getDeepSeekEmail();

    btn.textContent = 'Validating...';
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.transform = 'scale(0.97)';

    chrome.runtime.sendMessage({
      action: 'validateKey',
      key: key,
      deviceId: deviceId,
      email: email,
    }, function(response) {
      btn.textContent = 'Activate Bridge';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.transform = 'none';

      if (response && response.valid) {
        licenseKey = key;
        saveKeyData(key, deviceId, email);
        saveCustomPrompt(customInput.value.trim());
        err.style.color = '#00ff94';
        err.textContent = 'Activated';
        startSection.style.display = 'block';
        startSection.style.animation = 'ecbSlideUp 0.3s cubic-bezier(0.16,1,0.3,1)';
        btn.style.display = 'none';
        input.style.display = 'none';
        getKeyBtn.style.display = 'none';
        var socialRow = fbBtn.parentElement;
        if (socialRow) socialRow.style.display = 'none';
      } else if (response && response.expired) {
        err.textContent = 'Key expired — contact Facebook/Discord for renewal';
        err.style.color = '#f59e0b';
      } else if (response && response.reason === 'Key already in use on another device') {
        err.textContent = 'This key is already activated on another device';
      } else {
        err.textContent = response && response.reason ? response.reason : 'Invalid key';
      }
    });
  }

  btn.addEventListener('click', doAuth);
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doAuth(); });
  startBtn.addEventListener('click', function() {
    saveCustomPrompt(customInput.value.trim());
    overlay.remove();
    startupSequence(licenseKey, true);
  });

  setTimeout(function() { input.focus(); }, 200);
}

// ── ZeroScript-style Bar (anchored above composer) ──────────────
var _barRAF = null;
var _barRunning = false;

var _projectPicker = null;

function createBridgePanel() {
  if (bridgePanel) return;
  var logoUrl = 'https://i.ibb.co/v6JLQWHt/ecrew.png';
  detectLightMode();
  startChipObserver();
  bridgePanel = document.createElement('div');
  bridgePanel.id = 'ecb-bar';
  Object.assign(bridgePanel.style, {
    position:'fixed', zIndex:'2147483600',
    fontFamily:'ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif',
    fontSize:'12px', color:'#e8e8ec',
    display:'flex', alignItems:'center', gap:'9px',
    boxSizing:'border-box', padding:'7px 9px 7px 12px',
    background:'rgba(20,20,28,0.97)',
    border:'1px solid rgba(129,140,248,0.30)',
    borderRadius:'13px',
    boxShadow:'0 8px 30px rgba(0,0,0,0.42)',
    backdropFilter:'blur(10px)',
    WebkitBackdropFilter:'blur(10px)',
    userSelect:'none',
    opacity:'0',
    pointerEvents:'auto'
  });
  bridgePanel.innerHTML = [
    '<span id="ecb-dot" class="off" style="width:9px;height:9px;border-radius:50%;flex:none;background:#6b7280;cursor:help"></span>',
    '<img src="' + logoUrl + '" style="width:16px;height:16px;border-radius:4px;flex:none">',
    '<span id="ecb-brand" style="font-weight:700;letter-spacing:0.2px;flex:none;font-size:12.5px;color:#e8e8ec">Bridge</span>',
    '<span id="ecb-proj" style="flex:none;padding:2px 8px;border-radius:6px;border:1px solid rgba(129,140,248,0.15);font-size:10px;color:rgba(199,210,254,0.6);background:rgba(129,140,248,0.06);cursor:pointer;letter-spacing:0.2px;transition:background 0.15s" title="Active project">' + activeProject + '</span>',
    '<span id="ecb-state" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;font-size:11.5px;line-height:1.3;opacity:0.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><b style="opacity:1;color:#c7d2fe">Ready</b></span>',
    '<span id="ecb-log-toggle" style="flex:none;padding:2px 8px;border-radius:6px;border:1px solid rgba(129,140,248,0.12);font-size:10px;color:rgba(199,210,254,0.4);background:transparent;cursor:pointer;letter-spacing:0.2px;display:none;transition:background 0.14s" title="Activity log">\u25BC 0</span>',
    '<span id="ecb-new-session" style="flex:none;padding:2px 8px;border-radius:6px;border:1px solid rgba(0,200,255,0.12);font-size:10px;color:rgba(0,200,255,0.4);background:transparent;cursor:pointer;letter-spacing:0.2px;transition:all 0.14s" title="Start a new chat session">+ New</span>',
    '<button id="ecb-action" data-kind="start" style="flex:none;padding:7px 13px;border-radius:9px;border:none;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;box-shadow:0 2px 12px rgba(99,102,241,0.45);display:none;letter-spacing:0.2px">Start</button>',
    '<button id="ecb-stop" style="flex:none;padding:7px 13px;border-radius:9px;border:none;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;background:#ef4444;color:#fff;display:none;letter-spacing:0.2px">Stop</button>',
  ].join('\n');
  document.body.appendChild(bridgePanel);

  // Project picker: click to cycle or show dropdown
  var projEl = document.getElementById('ecb-proj');
  projEl.addEventListener('mouseenter', function() { projEl.style.background = 'rgba(0,200,255,0.08)'; });
  projEl.addEventListener('mouseleave', function() { if (!_projectPicker) projEl.style.background = 'rgba(0,200,255,0.03)'; });
  projEl.addEventListener('click', function(e) {
    e.stopPropagation();
    showProjectPicker(projEl);
  });

  var dot = document.getElementById('ecb-dot');
  var state = document.getElementById('ecb-state');

  document.getElementById('ecb-action').addEventListener('click', function(e) {
    e.stopPropagation();
    if (agentState === 'ready' && !agentLoopRunning) {
      startAgent();
    }
  });

  document.getElementById('ecb-stop').addEventListener('click', function(e) {
    e.stopPropagation();
    if (confirm('Stop the bridge agent?')) {
      stopBridge();
    }
  });

  document.getElementById('ecb-log-toggle').addEventListener('click', function(e) {
    e.stopPropagation();
    toggleLogPanel();
  });

  document.getElementById('ecb-new-session').addEventListener('click', function(e) {
    e.stopPropagation();
    if (confirm('Start a new chat session? This will navigate to a fresh conversation.')) {
      window.location.href = 'https://chat.deepseek.com/';
    }
  });
  document.getElementById('ecb-new-session').addEventListener('mouseenter', function() { this.style.color = 'rgba(0,200,255,0.8)'; this.style.borderColor = 'rgba(0,200,255,0.25)'; });
  document.getElementById('ecb-new-session').addEventListener('mouseleave', function() { this.style.color = 'rgba(0,200,255,0.4)'; this.style.borderColor = 'rgba(0,200,255,0.12)'; });

  _barRunning = true;
  // Sync bar position to composer each frame
  function placeBar() {
    if (!_barRunning || !bridgePanel || !bridgePanel.parentNode) { if (_barRAF) { cancelAnimationFrame(_barRAF); _barRAF = null; } return; }
    var input = getEditor();
    if (input) {
      var rect = input.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 20) {
        var bw = Math.min(rect.width - 4, 620);
        bridgePanel.style.left = (rect.left + (rect.width - bw) / 2) + 'px';
        bridgePanel.style.top = (rect.top - 44) + 'px';
        bridgePanel.style.width = bw + 'px';
        bridgePanel.style.opacity = '1';
      }
    }
    _barRAF = requestAnimationFrame(placeBar);
  }
  _barRAF = requestAnimationFrame(placeBar);
}

function toggleActionBtn(state) {
  var start = document.getElementById('ecb-action');
  var stop = document.getElementById('ecb-stop');
  if (state === 'working') {
    start.style.display = 'none';
    stop.style.display = '';
  } else {
    start.style.display = '';
    stop.style.display = 'none';
  }
}

function switchProject(name) {
  if (knownProjects.indexOf(name) === -1) return;
  activeProject = name;
  var el = document.getElementById('ecb-proj');
  if (el) el.textContent = name;
  hideProjectPicker();
}

function showProjectPicker(anchor) {
  hideProjectPicker();
  if (!knownProjects || knownProjects.length < 2) return;
  _projectPicker = document.createElement('div');
  _projectPicker.style.cssText = 'position:fixed;z-index:2147483644;background:rgba(6,6,18,0.92);backdrop-filter:blur(16px);border:1px solid rgba(0,200,255,0.12);border-radius:10px;padding:4px;box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:11px;min-width:120px';
  var list = document.createElement('div');
  knownProjects.forEach(function(p) {
    var item = document.createElement('div');
    item.style.cssText = 'padding:7px 12px;border-radius:6px;cursor:pointer;color:' + (p === activeProject ? 'rgba(0,200,255,0.9)' : 'rgba(255,255,255,0.5)') + ';background:' + (p === activeProject ? 'rgba(0,200,255,0.06)' : 'transparent') + ';transition:background 0.1s';
    item.textContent = p;
    item.addEventListener('mouseenter', function() { item.style.background = 'rgba(0,200,255,0.08)'; });
    item.addEventListener('mouseleave', function() { item.style.background = p === activeProject ? 'rgba(0,200,255,0.06)' : 'transparent'; });
    item.addEventListener('click', function(e) { e.stopPropagation(); switchProject(p); });
    list.appendChild(item);
  });
  _projectPicker.appendChild(list);
  document.body.appendChild(_projectPicker);

  var anchorRect = anchor.getBoundingClientRect();
  _projectPicker.style.left = anchorRect.left + 'px';
  _projectPicker.style.top = (anchorRect.bottom + 4) + 'px';

  setTimeout(function() { document.addEventListener('click', hideProjectPicker, { once: true }); }, 10);
}

function hideProjectPicker() {
  if (_projectPicker) { _projectPicker.remove(); _projectPicker = null; }
}

// ── Activity log panel ──────────────────────────────────────────
function addLogEntry(type, summary) {
  _logEntries.push({ type: type, summary: summary, time: Date.now() });
  if (_logEntries.length > 100) _logEntries.shift();
  var toggle = document.getElementById('ecb-log-toggle');
  if (toggle) {
    toggle.style.display = '';
    toggle.innerHTML = (_logPanelVisible ? '\u25BC' : '\u25B6') + ' ' + _logEntries.length;
  }
  if (_logPanelVisible) renderLogPanel();
}

function toggleLogPanel() {
  _logPanelVisible = !_logPanelVisible;
  if (_logPanelVisible) {
    renderLogPanel();
  } else {
    hideLogPanel();
  }
}

function hideLogPanel() {
  _logPanelVisible = false;
  var existing = document.getElementById('ecb-log-panel');
  if (existing) existing.remove();
  var toggle = document.getElementById('ecb-log-toggle');
  if (toggle) toggle.innerHTML = '\u25B6 ' + _logEntries.length;
}

function renderLogPanel() {
  var existing = document.getElementById('ecb-log-panel');
  if (existing) existing.remove();
  if (!bridgePanel) return;
  var panel = document.createElement('div');
  panel.id = 'ecb-log-panel';
  var barRect = bridgePanel.getBoundingClientRect();
  Object.assign(panel.style, {
    position:'fixed', zIndex:'2147483500',
    background:'rgba(6,6,18,0.9)',
    border:'1px solid rgba(0,200,255,0.1)',
    borderRadius:'12px',
    boxShadow:'0 12px 40px rgba(0,0,0,0.5)',
    backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    fontFamily:'ui-sans-serif,"Segoe UI",monospace',
    fontSize:'11px', color:'rgba(255,255,255,0.7)',
    overflow:'hidden',
    width: Math.max(barRect.width, 280) + 'px',
    maxHeight:'280px',
    left: barRect.left + 'px',
    top: (barRect.bottom + 4) + 'px',
  });
  var inner = document.createElement('div');
  inner.style.cssText = 'overflow-y:auto;max-height:260px;padding:4px';
  if (_logEntries.length === 0) {
    inner.innerHTML = '<div style="padding:16px;text-align:center;color:rgba(255,255,255,0.15);font-style:italic">No activity yet</div>';
  } else {
    var frag = document.createDocumentFragment();
    for (var i = Math.max(0, _logEntries.length - 50); i < _logEntries.length; i++) {
      var e = _logEntries[i];
      var row = document.createElement('div');
      row.style.cssText = 'padding:3px 8px;border-radius:4px;margin:1px 0;display:flex;gap:6px;align-items:baseline';
      var dot = document.createElement('span');
      dot.style.cssText = 'flex:none;width:4px;height:4px;border-radius:50%;background:' + (e.type === 'send' ? '#00c8ff' : e.type === 'done' ? '#34d399' : e.type === 'error' ? '#ef4444' : 'rgba(255,255,255,0.2)');
      row.appendChild(dot);
      var text = document.createElement('span');
      text.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,0.55)';
      text.textContent = e.summary;
      row.appendChild(text);
      // hover to see full text
      text.title = e.summary;
      frag.appendChild(row);
    }
    inner.appendChild(frag);
  }
  panel.appendChild(inner);

  // Click outside to close
  panel.addEventListener('click', function(ev) { ev.stopPropagation(); });

  document.body.appendChild(panel);
  // Scroll to bottom
  inner.scrollTop = inner.scrollHeight;

  var toggle = document.getElementById('ecb-log-toggle');
  if (toggle) toggle.innerHTML = '\u25BC ' + _logEntries.length;

  // Auto-close on click away
  if (_logCloser) document.removeEventListener('mousedown', _logCloser);
  _logCloser = function(ev) {
    var p = document.getElementById('ecb-log-panel');
    if (p && !p.contains(ev.target) && ev.target.id !== 'ecb-log-toggle') {
      hideLogPanel();
    }
  };
  setTimeout(function() { document.addEventListener('mousedown', _logCloser); }, 100);
}

function stopBridge() {
  setInputLock(false);
  coverComposer(false);
  hideLogPanel();
  _barRunning = false;
  if (_barRAF) { cancelAnimationFrame(_barRAF); _barRAF = null; }
  agentLoopRunning = false;
  agentState = 'ready';
  updatePanel('ready');
}

function updatePanel(state, fileCount) {
  var dot = document.getElementById('ecb-dot');
  var stateEl = document.getElementById('ecb-state');
  var logToggle = document.getElementById('ecb-log-toggle');
  if (!dot || !stateEl) return;
  if (logToggle) logToggle.innerHTML = '\u25BC ' + _logEntries.length;
  var states = {
    ready:    { cls:'on',  color:'#34d399', shadow:'0 0 8px #34d399', label:'<b>Ready</b>' },
    working:  { cls:'on',  color:'#34d399', shadow:'0 0 8px #34d399', label:'<span class="ecb-live-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;flex:none;animation:ecbLive 1.8s ease-out infinite;margin-right:2px;vertical-align:middle"></span><b>Working...</b>' },
    waiting:  { cls:'warn',color:'#fbbf24', shadow:'0 0 8px #fbbf24', label:'<b>Needs Input</b>' },
    starting: { cls:'warn',color:'#fbbf24', shadow:'0 0 8px #fbbf24', label:'<b>Starting...</b>' },
    locked:   { cls:'off', color:'#6b7280', shadow:'none', label:'<b>Disconnected</b>' },
  };
  var s = states[state] || states.locked;
  dot.style.background = s.color;
  dot.style.boxShadow = s.shadow;
  var lbl = s.label;
  if (fileCount !== undefined) {
    lbl += ' <span style="color:rgba(255,255,255,0.25);font-size:9.5px;margin-left:4px">' + fileCount + ' files</span>';
  }
  stateEl.innerHTML = lbl;
  var projEl = document.getElementById('ecb-proj');
  if (projEl) projEl.textContent = activeProject;
  toggleActionBtn(state);
}

// ── Helper for live dot in working state ───────────────────────
function liveDotHtml() {
  return '<span class="ecb-live-dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;flex:none;animation:ecbPulse 1.8s ease-out infinite;margin-right:2px"></span>';
}

// ── Input lock (ZeroScript-style) ──────────────────────────────
var _logCloser = null;

function showInputBlock() {
  setInputLock(true);
  // Also show the input cover overlay
  coverComposer(true);
}

function hideInputBlock() {
  setInputLock(false);
  coverComposer(false);
}

// ── Composer cover overlay ─────────────────────────────────────
var _coverEl = null;

function coverComposer(show) {
  if (show) {
    if (_coverEl) return;
    _coverEl = document.createElement('div');
    _coverEl.id = 'ecb-input-cover';
    var ta = getEditor();
    if (!ta) return;
    var rect = ta.getBoundingClientRect();
    Object.assign(_coverEl.style, {
      position: 'fixed', zIndex: '2147483500',
      left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      display: 'flex', alignItems: 'center', paddingLeft: '16px',
      boxSizing: 'border-box', borderRadius: '14px',
      background: 'transparent', pointerEvents: 'auto', cursor: 'default',
      fontSize: '12px', color: 'rgba(140,140,150,0.9)',
      fontFamily: 'ui-sans-serif,"Segoe UI",sans-serif',
    });
    _coverEl.textContent = '\u23F3 Bridge working\u2026 please wait';
    document.body.appendChild(_coverEl);
    // Re-position on scroll/resize
    if (!_coverRAF) {
      _coverRAF = true;
      var reposition = function() {
        if (!_coverEl || !_coverRAF) { _coverRAF = false; return; }
        var te = getEditor();
        if (te) {
          var r = te.getBoundingClientRect();
          _coverEl.style.left = r.left + 'px';
          _coverEl.style.top = r.top + 'px';
          _coverEl.style.width = r.width + 'px';
          _coverEl.style.height = r.height + 'px';
        }
        requestAnimationFrame(reposition);
      };
      requestAnimationFrame(reposition);
    }
  } else {
    if (_coverEl) { _coverEl.remove(); _coverEl = null; }
    _coverRAF = false;
  }
}
var _coverRAF = false;

function showAskButtons(question, options) {
  var existing = document.getElementById('ecb-ask-buttons');
  if (existing) existing.remove();
  var container = document.createElement('div');
  container.id = 'ecb-ask-buttons';
  Object.assign(container.style, {
    position:'fixed', bottom:'100px', left:'50%', transform:'translateX(-50%)',
    zIndex:'2147483646', display:'flex', gap:'10px', flexWrap:'wrap',
    justifyContent:'center', maxWidth:'80%',
  });
  options.forEach(function(opt) {
    var btn = document.createElement('button');
    btn.textContent = opt;
    Object.assign(btn.style, {
      padding:'8px 20px', borderRadius:'8px', border:'1px solid rgba(99,102,241,0.5)',
      background:'rgba(15,15,30,0.9)', color:'#c7d2fe', cursor:'pointer',
      fontFamily:'ui-sans-serif,sans-serif', fontSize:'13px', fontWeight:'600',
      backdropFilter:'blur(8px)', transition:'all 0.15s',
    });
    btn.onmouseover = function() { btn.style.background = 'rgba(99,102,241,0.3)'; btn.style.borderColor = '#818cf8'; };
    btn.onmouseout = function() { btn.style.background = 'rgba(15,15,30,0.9)'; btn.style.borderColor = 'rgba(99,102,241,0.5)'; };
    btn.onclick = function() {
      container.remove();
      sendUserMessage(opt);
    };
    container.appendChild(btn);
  });
  document.body.appendChild(container);
}

function sendUserMessage(text) {
  var ta = document.querySelector('textarea, [contenteditable="true"]');
  if (ta) {
    if (ta.tagName === 'TEXTAREA') { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    else { ta.textContent = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
    var sendBtn = document.querySelector('button[aria-label*="send" i], button[aria-label*="submit" i], [data-testid*=send]');
    if (!sendBtn) sendBtn = document.querySelector('button svg')?.closest('button');
    if (sendBtn) sendBtn.click();
    else {
      var enter = new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true });
      ta.dispatchEvent(enter);
    }
  }
}

function bridgeLog(msg, detail) {
  console.log('[ECB]', msg, detail || '');
  // Update state label briefly to show latest action
  var stateEl = document.getElementById('ecb-state');
  if (stateEl) {
    stateEl.innerHTML = '<b>' + msg.substring(0, 40) + '</b>';
  }
}

// ── ECB MARKER ──────────────────────────────────────────────────
const ECB_MARKER = '\u27F2ECB\u27F2';

// ── System prompt ────────────────────────────────────────────────
const SYSTEM_PROMPT = [
  ECB_MARKER,
  'CONTEXT:',
  'A browser extension (ECB - Encrypted Crew Bridge) is running inside this page. It watches your replies. When it detects a ECB command in your text, it runs it against the local MCP server (file editing, git, terminal) and sends the result back as the next message. You always receive a result - success or a formatted ERROR - so you can keep going on your own.',
  '',
  'The user\'s local development environment, reached through a local bridge, is always connected. You have access to file operations (read, write, edit, list), git operations (status, diff, commit, revert), and terminal commands.',
  '',
  'CRITICAL - ECB commands are NOT function calls or tools. They are plain JSON you TYPE into your normal text reply; ECB reads your text and runs them. So NEVER use your own native/built-in tools or features - none of that touches the user\'s local environment. Internal reasoning (deep-think modes) is fine. Do not try to "call a function" - just write the JSON below as ordinary text.',
  '',
  'COMMAND FORMAT:',
  'Write this JSON object inside a fenced code block (triple backticks). Outside a code block, the page renders your text as Markdown and can mangle the JSON.',
  '```',
  '{',
  '  "command": "command_name",',
  '  "params": {"key": "value"}',
  '}',
  '```',
  'For example, to list the project files:',
  '```',
  '{"command": "list_files"}',
  '```',
  '',
  'AVAILABLE COMMANDS:',
  '  write_file / save_file - Write content to a file. Params: {path, content}',
  '  read_file - Read a file. Params: {path, startLine?, endLine?}',
  '  list_files - List all files in the project. Params: (none)',
  '  edit_file - Apply search/replace patches. Params: {path, patches: [{search, replace}]}',
  '  run_command - Run a terminal command. Params: {command}',
  '  git - Run a git operation (status/diff/commit/revert). Params: {action, arg?}',
  '  search_files - Search file contents. Params: {query, includeExt?, excludeDir?}',
  '  tree - Show directory tree. Params: {path?}',
  '  rename - Rename a file. Params: {oldPath, newPath}',
  '  delete_file - Delete a file. Params: {path}',
  '  undo - Undo last file change. Params: {path?}',
  '  format_file - Format a file. Params: {path}',
  '  ask_user - Ask the user for input. Params: {question, options?}',
  '  task_done - Mark a task as complete. Params: {summary}',
  '',
  'RULES:',
  '- You can send MULTIPLE commands in a single reply. Batch independent operations together to reduce round-trips. For example, reading three files can be done as three read_file commands in one reply - they execute in parallel and return together.',
  '- A short note around commands is fine, but NEVER end a turn by only announcing a command ("let me check...", "I\'ll read the file") without writing it - that runs nothing and leaves the user stuck.',
  '- Final answers: plain text only, no code fences. Do ONLY what was asked. When the task is done or the user is satisfied, reply ONE short sentence with [DONE]summary[/DONE] at the end and STOP.',
  '- Use ONLY the exact command names and parameter keys from the list.',
  '- On ERROR: read it and adapt - fix the command, try another, or tell the user plainly if it is an environment problem (bridge offline).',
  '- On success: report the result concisely and continue with the next step.',
  '',
  'ACTIVE PROJECT: {{ACTIVE_PROJECT}}',
  'KNOWN PROJECTS: {{KNOWN_PROJECTS}}',
  '',
  'Always respond professionally and concisely. Start by greeting the user and asking what they\'d like to work on.',
];

// ── JSON command parser (ZeroScript-style) ──────────────────────
function parseJsonCommands(text) {
  if (!text) return [];
  var actions = [];
  // Find fenced code blocks containing JSON
  var codeBlockRe = /```(?:json)?\s*\n?([\s\S]*?)```/g;
  var m;
  while ((m = codeBlockRe.exec(text)) !== null) {
    var block = m[1].trim();
    // Try to parse as JSON command
    try {
      var parsed = JSON.parse(block);
      if (parsed && typeof parsed === 'object' && parsed.command) {
        var cmd = parsed.command;
        var params = parsed.params || {};
        actions.push(convertJsonToAction(cmd, params));
      }
    } catch (e) {
      // Not valid JSON - check for legacy tags inside the block
      var legacy = parseLegacyTagsFromText(block);
      actions = actions.concat(legacy);
    }
  }
  // Also scan for inline JSON commands (not in code blocks)
  var inlineRe = /\{(?:\s*)"command"\s*:\s*"([^"]+)"([\s\S]*?)\}/g;
  while ((m = inlineRe.exec(text)) !== null) {
    try {
      var parsed = JSON.parse(m[0]);
      if (parsed && parsed.command) {
        var cmd = parsed.command;
        var params = parsed.params || {};
        var action = convertJsonToAction(cmd, params);
        // Deduplicate: only add if not already present
        if (!actions.some(function(a) { return a.type === action.type && JSON.stringify(a) === JSON.stringify(action); })) {
          actions.push(action);
        }
      }
    } catch (e) {}
  }
  return actions;
}

function convertJsonToAction(cmd, params) {
  switch (cmd) {
    case 'write_file': case 'save_file':
      return { type: 'save', path: params.path || '', content: params.content || '' };
    case 'read_file':
      return { type: 'read', path: params.path || '', startLine: params.startLine, endLine: params.endLine };
    case 'list_files':
      return { type: 'list' };
    case 'edit_file':
      return { type: 'patch', path: params.path || '', patches: params.patches || [] };
    case 'run_command':
      return { type: 'run', command: params.command || '' };
    case 'git':
      return { type: 'git', gitAction: params.action || 'status', arg: params.arg || '' };
    case 'search_files':
      return { type: 'search', query: params.query || '', includeExt: params.includeExt, excludeDir: params.excludeDir };
    case 'tree':
      return { type: 'tree', path: params.path || '' };
    case 'rename':
      return { type: 'rename', oldPath: params.oldPath || '', newPath: params.newPath || '' };
    case 'delete_file':
      return { type: 'delete', path: params.path || '' };
    case 'undo':
      return { type: 'undo', path: params.path || '' };
    case 'format_file':
      return { type: 'format', path: params.path || '' };
    case 'ask_user':
      return { type: 'ask', question: params.question || '', options: params.options || [] };
    case 'task_done': case 'done':
      return { type: 'done', summary: params.summary || '' };
    default:
      return { type: 'unknown', raw: cmd, params: params };
  }
}

function parseLegacyTagsFromText(text) {
  var actions = [];
  var saveRe = /\[(?:SAVE|WRITE)\s+(.+?)\]([\s\S]*?)(?:\Z|\[\/(?:SAVE|WRITE|PATCH)\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|ASK|DONE|STRUCTURE))/g;
  var m;
  while ((m = saveRe.exec(text)) !== null) {
    actions.push({ type: 'save', path: m[1].trim(), content: m[2].trim() });
  }
  var readRe = /\[READ\s+(.+?)\]/g;
  while ((m = readRe.exec(text)) !== null) {
    var raw = m[1].trim();
    var rangeMatch = raw.match(/^(.+?):(\d+)-(\d+)$/);
    if (rangeMatch) {
      actions.push({ type: 'read', path: rangeMatch[1].trim(), startLine: parseInt(rangeMatch[2], 10), endLine: parseInt(rangeMatch[3], 10) });
    } else {
      actions.push({ type: 'read', path: raw });
    }
  }
  if (/\[LIST\]/.test(text)) actions.push({ type: 'list' });
  return actions;
}

// Combined parser: tries JSON first, falls back to legacy tags
function parseAllCommands(text) {
  var json = parseJsonCommands(text);
  if (json.length > 0) return json;
  return parseAgentTags(text);
}

// ── Tag parsing (closing tags optional) ──────────────────────────
function parseAgentTags(text) {
  if (!text) return [];
  var actions = [];
  // Helper: match content until closing tag, next [TAG, or end of string
  function contentUntil(tag) {
    var close = new RegExp('\\[/' + tag + '\\]|\\[\\w+', 'g');
    close.lastIndex = arguments[2] || 0;
    var m = close.exec(text);
    return m && m[0] === '[/' + tag + ']' ? { end: close.lastIndex, content: text.slice(0, m.index).trim() } : { end: text.length, content: text.slice(0).trim() };
  }

  var m;

  // SAVE/WRITE: [SAVE path]content or [WRITE path]content
  var saveRe = /\[(?:SAVE|WRITE)\s+(.+?)\]/g;
  while ((m = saveRe.exec(text)) !== null) {
    var rest = text.slice(m.index + m[0].length);
    var closeMatch = rest.match(/([\s\S]*?)(?:\Z|\[\/(?:SAVE|WRITE|PATCH)\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|ASK|DONE|STRUCTURE))/);
    var content = closeMatch ? closeMatch[1].trim() : '';
    actions.push({ type: 'save', path: m[1].trim(), content: content });
  }

  // READ: [READ path], [READ path:start-end] (line range), or [READ path][/READ]
  var readRe = /\[READ\s+(.+?)\]/g;
  while ((m = readRe.exec(text)) !== null) {
    var raw = m[1].trim();
    var rangeMatch = raw.match(/^(.+?):(\d+)-(\d+)$/);
    if (rangeMatch) {
      actions.push({ type: 'read', path: rangeMatch[1].trim(), startLine: parseInt(rangeMatch[2], 10), endLine: parseInt(rangeMatch[3], 10) });
    } else {
      actions.push({ type: 'read', path: raw });
    }
  }

  // LIST: [LIST] or [LIST][/LIST]
  var listRe = /\[LIST\]/g;
  while ((m = listRe.exec(text)) !== null) {
    actions.push({ type: 'list' });
  }

  // DELETE: [DELETE path] or [DELETE path][/DELETE]
  var deleteRe = /\[DELETE\s+(.+?)\]/g;
  while ((m = deleteRe.exec(text)) !== null) {
    actions.push({ type: 'delete', path: m[1].trim() });
  }

  // EXPORT: [EXPORT path -> dest]content...[/EXPORT] or [EXPORT path -> dest]content...
  var exportRe = /\[EXPORT\s+(.+?)\s*->\s*(.+?)\]/g;
  while ((m = exportRe.exec(text)) !== null) {
    var rest2 = text.slice(m.index + m[0].length);
    var closeMatch2 = rest2.match(/([\s\S]*?)(?:\Z|\[\/EXPORT\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|ASK|DONE|STRUCTURE))/);
    var content2 = closeMatch2 ? closeMatch2[1].trim() : '';
    actions.push({ type: 'export', path: m[1].trim(), destination: m[2].trim(), content: content2 });
  }

  // SEARCH: [SEARCH query], [SEARCH query type=.js,.ts], [SEARCH query exclude=dist/]
  var searchRe = /\[SEARCH\s+(.+?)\]/g;
  while ((m = searchRe.exec(text)) !== null) {
    var raw = m[1].trim();
    var includeExt, excludeDir;
    var typeMatch = raw.match(/\btype=([\w.,*]+)/);
    if (typeMatch) { includeExt = typeMatch[1].split(',').map(function(s) { return s.startsWith('.') ? s : '.' + s; }); raw = raw.replace(typeMatch[0], '').trim(); }
    var exclMatch = raw.match(/\bexclude=([\w.,/\\*]+)/);
    if (exclMatch) { excludeDir = exclMatch[1].split(','); raw = raw.replace(exclMatch[0], '').trim(); }
    actions.push({ type: 'search', query: raw, includeExt: includeExt, excludeDir: excludeDir });
  }

  // TREE: [TREE path] or [TREE] (defaults to root)
  var treeRe = /\[TREE\s+(.+?)\]/g;
  while ((m = treeRe.exec(text)) !== null) {
    actions.push({ type: 'tree', path: m[1].trim() });
  }
  if (!treeRe.lastIndex && /\[TREE\]/.test(text)) {
    actions.push({ type: 'tree', path: '' });
  }

  // STRUCTURE: [STRUCTURE] or [STRUCTURE project]
  var structRe = /\[STRUCTURE\s+(.+?)\]/g;
  while ((m = structRe.exec(text)) !== null) {
    actions.push({ type: 'structure', project: m[1].trim() });
  }
  if (!structRe.lastIndex && /\[STRUCTURE\]/.test(text)) {
    actions.push({ type: 'structure', project: '' });
  }

  // READ_MULTI: [READ_MULTI path1, path2, ...]
  var multiRe = /\[READ_MULTI\s+(.+?)\]/g;
  while ((m = multiRe.exec(text)) !== null) {
    var paths = m[1].split(',').map(function(p) { return p.trim(); }).filter(function(p) { return p; });
    actions.push({ type: 'read_multi', paths: paths });
  }

  // PATCH: [PATCH path] search/replace blocks inside
  var patchRe = /\[PATCH\s+(.+?)\]/g;
  while ((m = patchRe.exec(text)) !== null) {
    var restP = text.slice(m.index + m[0].length);
    var closeP = restP.match(/([\s\S]*?)(?:\Z|\[\/(?:PATCH|SAVE|WRITE)\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|ASK|DONE|STRUCTURE))/);
    var patchBody = closeP ? closeP[1] : '';
    var patches = [];
    // Parse <<<<<<< SEARCH / ======= / >>>>>>> blocks
    var blockRe = /<<<<<<<.*?\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>/g;
    var bm;
    while ((bm = blockRe.exec(patchBody)) !== null) {
      patches.push({ search: bm[1].replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, ''), replace: bm[2].replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '') });
    }
    if (patches.length === 0) {
      // Fallback: treat entire body as single replace (old->new via --- separator)
      var sep = patchBody.indexOf('\n---\n');
      if (sep > -1) {
        patches.push({ search: patchBody.slice(0, sep).trim(), replace: patchBody.slice(sep + 5).trim() });
      }
    }
    actions.push({ type: 'patch', path: m[1].trim(), patches: patches });
  }

  // RENAME: [RENAME old -> new]
  var renameRe = /\[RENAME\s+(.+?)\s*->\s*(.+?)\]/g;
  while ((m = renameRe.exec(text)) !== null) {
    actions.push({ type: 'rename', oldPath: m[1].trim(), newPath: m[2].trim() });
  }

  // GIT: [GIT status], [GIT diff], [GIT commit message], [GIT revert path]
  var gitRe = /\[GIT\s+(status|diff|commit|revert)\s*(.*?)\]/g;
  while ((m = gitRe.exec(text)) !== null) {
    actions.push({ type: 'git', gitAction: m[1].trim(), arg: m[2].trim() });
  }

  // RUN: [RUN command]
  var runRe = /\[RUN\s+(.+?)\]/g;
  while ((m = runRe.exec(text)) !== null) {
    actions.push({ type: 'run', command: m[1].trim() });
  }

  // UNDO: [UNDO] or [UNDO path]
  var undoRe = /\[UNDO\s+(.+?)\]/g;
  while ((m = undoRe.exec(text)) !== null) {
    actions.push({ type: 'undo', path: m[1].trim() });
  }
  if (!undoRe.lastIndex && /\[UNDO\]/.test(text)) {
    actions.push({ type: 'undo', path: '' });
  }

  // FORMAT: [FORMAT path]
  var formatRe = /\[FORMAT\s+(.+?)\]/g;
  while ((m = formatRe.exec(text)) !== null) {
    actions.push({ type: 'format', path: m[1].trim() });
  }

  // ASK: [ASK]question[/ASK] or [ASK]question or [ASK]question @opt1|@opt2
  var askRe = /\[ASK\]([\s\S]*?)(?:\Z|\[\/ASK\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|DONE|STRUCTURE))/;
  var askMatch = text.match(askRe);
  if (askMatch) {
    var q = askMatch[1].trim();
    var opts = [];
    var optMatch = q.match(/(.+?)\s+@(.+)/);
    if (optMatch) { q = optMatch[1].trim(); opts = optMatch[2].split('|').map(function(s) { return s.trim(); }); }
    actions.push({ type: 'ask', question: q, options: opts });
  }

  // DONE: [DONE]summary[/DONE] or [DONE]summary
  var doneRe = /\[DONE\]([\s\S]*?)(?:\Z|\[\/DONE\]|\[(?:SAVE|WRITE|READ|LIST|DELETE|EXPORT|SEARCH|TREE|READ_MULTI|RENAME|PATCH|GIT|RUN|UNDO|FORMAT|ASK|STRUCTURE))/;
  var doneMatch = text.match(doneRe);
  if (doneMatch) {
    actions.push({ type: 'done', summary: doneMatch[1].trim() });
  }

  return actions;
}

var _mcpConnected = false;

function sendMCP(action, data) {
  return new Promise(function(resolve) {
    var timer = setTimeout(function() { resolve({ success: false, error: 'timeout' }); }, 15000);
    chrome.runtime.sendMessage(Object.assign({ action: action, project: activeProject }, data), function(response) {
      clearTimeout(timer);
      if (!response || response.error === 'no response' || response.error === 'Server unreachable') {
        _mcpConnected = false;
        updateConnectionStatus();
        chrome.runtime.sendMessage({ action: 'checkConnection' }, function(ok) {
          if (ok && ok.success) {
            _mcpConnected = true;
            updateConnectionStatus();
            var timer2 = setTimeout(function() { resolve({ success: false, error: 'timeout' }); }, 15000);
            chrome.runtime.sendMessage(Object.assign({ action: action, project: activeProject }, data), function(retry) {
              clearTimeout(timer2);
              resolve(retry || { success: false, error: 'no response' });
            });
          } else {
            resolve(response || { success: false, error: 'Server unreachable' });
          }
        });
      } else {
        _mcpConnected = true;
        updateConnectionStatus();
        resolve(response);
      }
    });
  });
}

function updateConnectionStatus() {
  var stateEl = document.getElementById('ecb-state');
  var dot = document.getElementById('ecb-dot');
  if (!_mcpConnected && stateEl) {
    stateEl.innerHTML = '<b style="color:#ef4444">Reconnecting...</b>';
    if (dot) { dot.style.background = '#ef4444'; dot.style.boxShadow = '0 0 8px #ef4444'; }
  }
}

function stripProject(path) {
  var prefix = activeProject + '/';
  if (path.indexOf(prefix) === 0) return path.slice(prefix.length);
  return path;
}

async function readFileAction(path) {
  var res = await sendMCP('readFile', { filePath: stripProject(path) });
  return res.success ? res.content : 'Error: ' + (res.error || 'read failed');
}

async function listFilesAction() {
  var res = await sendMCP('listFiles', {});
  if (res.success) {
    knownProjects = (res.projects || []).map(function(p) { return p.name; });
    var detail = 'Bridge contains ' + (res.count || 0) + ' files across projects.\n';
    if (res.projects && res.projects.length > 0) {
      detail += '\nProjects:\n';
      res.projects.forEach(function(p) {
        detail += '  ' + p.name + ' (' + p.fileCount + ' files):\n';
        if (p.files && p.files.length > 0) {
          p.files.forEach(function(f) { detail += '    - ' + f + '\n'; });
        }
      });
    }
    return detail;
  }
  return 'Error: ' + (res.error || 'list failed');
}

async function saveFileAction(path, content) {
  var res = await sendMCP('saveCode', { filePath: stripProject(path), text: content });
  if (res.success) updateFileCount();
  return res;
}

async function patchFileAction(path, patches) {
  var res = await sendMCP('patchCode', { filePath: stripProject(path), patches: patches });
  if (res.success && res.applied > 0) updateFileCount();
  if (res.success) {
    var detail = '\u2714 ' + path + ' patched (' + res.applied + ' change' + (res.applied > 1 ? 's' : '') + ' applied';
    if (res.failed > 0) detail += ', ' + res.failed + ' failed';
    detail += ')';
    if (res.errors && res.errors.length > 0) {
      res.errors.forEach(function(e) { detail += '\n  \u26A0 ' + e; });
    }
    if (res.diff) {
      detail += '\n\nDiff:\n' + res.diff;
    }
    return detail;
  }
  return '\u2718 Patch failed: ' + (res.error || 'unknown');
}

async function deleteFileAction(path) {
  var res = await sendMCP('deleteCode', { filePath: stripProject(path) });
  if (res.success) updateFileCount();
  return res;
}

async function exportFileAction(path, destination, content) {
  var res = await sendMCP('exportCode', { filePath: stripProject(path), destination: destination, text: content });
  return res;
}

async function searchFilesAction(query, includeExt, excludeDir) {
  var res = await sendMCP('searchCode', { query: query, project: activeProject, includeExt: includeExt, excludeDir: excludeDir });
  if (res.success) {
    var results = res.results || [];
    if (results.length === 0) return 'No matches found for: ' + query;
    var label = 'Search results for "' + query + '"';
    if (includeExt) label += ' [type=' + includeExt.join(',') + ']';
    if (excludeDir) label += ' [exclude=' + excludeDir.join(',') + ']';
    var maxShow = 50;
    var detail = label + ' (' + results.length + ' matches):\n';
    var shown = 0;
    results.forEach(function(r) {
      if (shown >= maxShow) { detail += '  ... and ' + (results.length - shown) + ' more\n'; return; }
      detail += '  ' + r.file + ':' + r.line + '  ' + r.content + '\n';
      shown++;
    });
    return detail;
  }
  return 'Error: ' + (res.error || 'search failed');
}

async function structureAction(project) {
  var res = await sendMCP('projectSummary', { project: project });
  if (res.success && res.summary) {
    var s = res.summary;
    var detail = '\u2501\u2501\u2501 Project: ' + s.name + ' (' + s.detectedType + ') \u2501\u2501\u2501\n';
    detail += 'Files: ' + s.totalFiles + ' | Dirs: ' + s.totalDirs + ' | Size: ' + formatSize(s.totalSizeBytes) + '\n\n';
    if (s.keyFiles && s.keyFiles.length > 0) {
      detail += 'Key config files:\n  ' + s.keyFiles.join('\n  ') + '\n\n';
    }
    detail += 'Directory structure (files / size):\n';
    (s.dirs || []).forEach(function(d) {
      var indent = d.path === '.' ? '' : '  ';
      detail += indent + d.path + ' (' + d.fileCount + ' files, ' + formatSize(d.sizeBytes) + ')\n';
    });
    return detail;
  }
  return 'Error: ' + (res.error || 'structure failed');
}

async function readFileRangeAction(path, startLine, endLine) {
  var res = await sendMCP('readFileRange', { filePath: path, startLine: startLine, endLine: endLine });
  if (res.success && res.content !== undefined) {
    var info = 'Lines ' + startLine + '-' + endLine + ' of ' + res.totalLines + ' (file: ' + res.totalBytes + ' bytes)';
    return info + '\n' + res.content;
  }
  return 'Error: ' + (res.error || 'read range failed');
}

async function gitAction(sub, arg) {
  var res = await sendMCP('gitCmd', { gitAction: sub, filePath: sub === 'revert' ? arg : undefined, message: sub === 'commit' ? arg : undefined });
  return res.success ? (res.output || 'ok') : 'Error: ' + (res.error || 'git failed');
}

async function runAction(command) {
  var res = await sendMCP('runTerminal', { command: command });
  if (res.success) {
    var detail = '\u2501\u2501\u2501 Output \u2501\u2501\u2501\n';
    if (res.stdout) detail += res.stdout + '\n';
    if (res.stderr) detail += '\u26A0 ' + res.stderr + '\n';
    if (res.code !== 0) detail += 'Exit code: ' + res.code;
    return detail.trim();
  }
  return 'Error: ' + (res.error || 'run failed');
}

async function undoAction(path) {
  var res = await sendMCP('undoOp', { filePath: path || undefined });
  return res.success ? (res.message || 'Undone') : 'Error: ' + (res.error || 'undo failed');
}

async function formatAction(path) {
  var res = await sendMCP('formatOp', { filePath: path });
  return res.success ? (res.output || 'Formatted') : 'Error: ' + (res.error || 'format failed');
}

function formatSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

// ── Tool Chip Decoration (ZeroScript-style) ─────────────────────
const EC = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  gear:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6h.09A1.65 1.65 0 0 0 12 3.09 2 2 0 0 1 16 3v.09A1.65 1.65 0 0 0 19 4.6l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21.4 11h.1a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.5 1z"/></svg>',
  spin: '<span class="ecb-chip-spin"></span>',
};
function ecIcon(phase) {
  if (phase === 'run') return EC.spin;
  if (phase === 'err') return EC.error;
  if (phase === 'sys') return EC.gear;
  return EC.check;
}

function hideToolBlock(item, chipEl) {
  var hasStart = function(t) { return /{"(?:command|tool)"\s*:/.test(t); };
  var containers = [...item.querySelectorAll(S.markdown)].filter(function(m) { return !m.closest(S.thinking); });
  if (!containers.length) return;
  containers.forEach(function(container) {
    var kids = [...container.children].filter(function(k) { return k !== chipEl && !(chipEl && chipEl.contains(k)); });
    for (var i = 0; i < kids.length; i++) {
      var txt = kids[i].textContent || '';
      if (!hasStart(txt)) continue;
      var hide = kids[i];
      var wrap = hide.closest('[class*="code"], .md-code-block');
      if (wrap && container.contains(wrap) && wrap !== container) hide = wrap;
      hide.classList.add('ecb-tool-hide');
    }
  });
}

function isEcbFeedback(txt) { return /^\s*(Output of |ERROR:)/.test(txt); }
function isSysPrompt(txt) { return txt.indexOf(ECB_MARKER) === 0; }
function hasEcbCommand(txt) { return /{"(?:command|tool)"\s*:/.test(txt); }

var decorate = {
  chip: function(item, opts) {
    var label = opts.label, detail = opts.detail || '', body = opts.body || '', phase = opts.phase, whole = opts.whole;
    var hasBody = !!body;
    var chipEl = item.querySelector('.ecb-chip');
    if (!chipEl) {
      chipEl = document.createElement('div');
      chipEl.className = 'ecb-chip ecb-chip-' + (phase || 'run');
      var head = document.createElement('div');
      head.className = 'ecb-chip-head';
      head.innerHTML =
        '<span class="ecb-chip-ic">' + ecIcon(phase) + '</span>' +
        '<span class="ecb-chip-tx"></span>' +
        '<span class="ecb-chip-dt"></span>' +
        (hasBody ? '<span class="ecb-chip-cv">\u25BC</span>' : '');
      chipEl.appendChild(head);
      head.querySelector('.ecb-chip-tx').textContent = label;
      if (detail) head.querySelector('.ecb-chip-dt').textContent = detail;
      if (hasBody) {
        var bodyEl = document.createElement('div');
        bodyEl.className = 'ecb-chip-body';
        var pre = document.createElement('pre');
        pre.textContent = body;
        bodyEl.appendChild(pre);
        chipEl.appendChild(bodyEl);
        head.style.cursor = 'pointer';
        head.onclick = function() { chipEl.classList.toggle('open'); };
      } else {
        chipEl.style.cursor = 'default';
      }
      // ALWAYS place chip as first child of the ITEM, never inside .ds-markdown
      if (chipEl.parentElement !== item) item.insertBefore(chipEl, item.firstChild);
      if (whole) {
        item.classList.add('ecb-whole-hidden');
      }
      hideToolBlock(item, chipEl);
    } else {
      chipEl.className = 'ecb-chip ecb-chip-' + (phase || 'run');
      chipEl.querySelector('.ecb-chip-ic').innerHTML = ecIcon(phase);
      var dt = chipEl.querySelector('.ecb-chip-dt');
      if (dt && detail) dt.textContent = detail;
      if (whole && !item.classList.contains('ecb-whole-hidden')) {
        item.classList.add('ecb-whole-hidden');
      }
    }
    return chipEl;
  },
  toolBox: function(item, name, phase, detail, body) {
    if (!item) return;
    this.chip(item, {
      label: name, detail: detail || '', body: body || '',
      category: 'tool', phase: phase, whole: false,
    });
  },
  classify: function(item) {
    if (item.querySelector('.ecb-chip')) return;
    var txt = (item.textContent || '').trim();
    // 1. System prompt → hide behind gear chip
    if (isSysPrompt(txt)) {
      this.chip(item, { label: 'System Prompt', phase: 'sys', whole: true, body: txt });
      return;
    }
    // 2. ECB feedback (Output of / ERROR:) → result chip
    if (isEcbFeedback(txt)) {
      var isErr = /^\s*ERROR/.test(txt);
      this.chip(item, {
        label: isErr ? 'Error' : 'Output',
        detail: txt.length > 80 ? txt.substring(0, 80) + '...' : txt,
        body: txt,
        category: 'tool',
        phase: isErr ? 'err' : 'result',
        whole: true,
      });
      return;
    }
    // 3. Assistant message with JSON commands → command chip (full content, scrollable)
    if (!isAssistantItem(item)) return;
    if (hasEcbCommand(txt) && !item.querySelector('.ecb-chip')) {
      this.toolBox(item, 'Command', 'done', '', txt);
    }
  },
};

// ── Chip Observer ───────────────────────────────────────────────
var _chipObserver = null;
function startChipObserver() {
  if (_chipObserver) return;
  _chipObserver = new MutationObserver(function() {
    requestAnimationFrame(function() { decorate.sweep(); });
  });
  _chipObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(function() { decorate.sweep(); });
  setTimeout(function() { decorate.sweep(); }, 500);
  setTimeout(function() { decorate.sweep(); }, 1500);
}
decorate.sweep = function() {
  var items = document.querySelectorAll(S.chatItem);
  items.forEach(function(item) { decorate.classify(item); });
};

async function treeAction(path) {
  var project = activeProject;
  var subDir;
  if (path) {
    var parts = path.split('/');
    if (parts.length > 1) { project = parts[0]; subDir = parts.slice(1).join('/'); }
    else if (knownProjects.indexOf(parts[0]) !== -1) { project = parts[0]; subDir = undefined; }
    else { subDir = parts[0]; }
  }
  var res = await sendMCP('treeFiles', { project: project, subDir: subDir || undefined });
  if (res.success) {
    return formatTree(res.tree, '');
  }
  return 'Error: ' + (res.error || 'tree failed');
}

function formatTree(node, indent) {
  if (!node) return '';
  var result = '';
  if (node.children) {
    node.children.forEach(function(child) {
      if (child.type === 'dir') {
        var name = child.path.split(/[/\\]/).pop();
        var childCount = (child.children || []).length;
        result += indent + '  ' + name + '/ (' + childCount + ' items)\n';
        result += formatTree(child, indent + '    ');
      } else {
        var fname = child.path.split(/[/\\]/).pop();
        var sizeStr = child.size != null && child.size > 0 ? ' (' + formatSize(child.size) + ')' : '';
        result += indent + '  ' + fname + sizeStr + '\n';
      }
    });
  }
  return result;
}

async function readMultiAction(paths) {
  var res = await sendMCP('batchRead', { filePaths: paths });
  if (res.success) {
    var results = res.results || [];
    var detail = 'Read ' + results.length + ' file(s):\n';
    results.forEach(function(r) {
      var maxLen = 2000;
      detail += '\n\u2501\u2501\u2501 ' + r.path + ' \u2501\u2501\u2501\n';
      if (r.error) { detail += 'Error: ' + r.error + '\n'; return; }
      var content = r.content || '(empty)';
      if (content.length > maxLen) content = content.slice(0, maxLen) + '\n... (truncated, ' + r.content.length + ' chars total)';
      detail += content + '\n';
    });
    return detail;
  }
  return 'Error: ' + (res.error || 'batch read failed');
}

async function renameFileAction(oldPath, newPath) {
  var res = await sendMCP('renameCode', { oldPath: oldPath, newPath: newPath });
  return res;
}

function updateFileCount() {
  sendMCP('listFiles', {}).then(function(res) {
    if (res && res.success) updatePanel(agentState, res.count || 0);
  }).catch(function(){});
}

async function executeActions(actions) {
  var feedbacks = [];
  var hasAsk = false;
  var hasDone = false;

  var promises = actions.map(function(action) {
    return (async function() {
      switch (action.type) {
        case 'save':
          bridgeLog('Saving ' + action.path);
          var saveRes = await saveFileAction(action.path, action.content);
          if (saveRes && saveRes.success) {
            return action.path + ' saved (' + (action.content ? action.content.length + ' bytes' : '') + ')';
          } else {
            return 'ERROR: ' + ((saveRes && saveRes.error) || 'write failed');
          }
        case 'read':
          var content;
          if (action.startLine && action.endLine) {
            var rangeRes = await readFileRangeAction(action.path, action.startLine, action.endLine);
            content = rangeRes;
          } else {
            content = await readFileAction(action.path);
          }
          bridgeLog('Read ' + action.path, content.length > 500 ? content.substring(0, 500) + '... (truncated)' : content);
          var maxShow = 10000;
          var show = content.length > maxShow ? content.slice(0, maxShow) + '\n... (truncated, ' + content.length + ' chars)' : content;
          return action.path + ' (' + content.length + ' chars):\n' + show;
        case 'list':
          var list = await listFilesAction();
          bridgeLog('Listed files', list);
          return list;
        case 'delete':
          bridgeLog('Deleting ' + action.path);
          var result = await deleteFileAction(action.path);
          if (result.success) {
            return 'Deleted ' + action.path;
          } else {
            return 'ERROR: ' + (result.error || 'delete failed');
          }
        case 'search':
          bridgeLog('Searching for "' + action.query + '"');
          return await searchFilesAction(action.query, action.includeExt, action.excludeDir);
        case 'tree':
          bridgeLog('Tree ' + (action.path || activeProject));
          return await treeAction(action.path);
        case 'patch':
          bridgeLog('Patching ' + action.path + ' (' + action.patches.length + ' changes)');
          return await patchFileAction(action.path, action.patches);
        case 'git':
          bridgeLog('Git ' + action.gitAction);
          return await gitAction(action.gitAction, action.arg);
        case 'run':
          bridgeLog('Running: ' + action.command.substring(0, 60));
          return await runAction(action.command);
        case 'undo':
          bridgeLog('Undo ' + (action.path || 'last'));
          return await undoAction(action.path);
        case 'format':
          bridgeLog('Formatting ' + action.path);
          return await formatAction(action.path);
        case 'read_multi':
          bridgeLog('Reading ' + action.paths.length + ' files');
          return await readMultiAction(action.paths);
        case 'rename':
          bridgeLog('Renaming ' + action.oldPath + ' -> ' + action.newPath);
          var renameResult = await renameFileAction(action.oldPath, action.newPath);
          if (renameResult.success) {
            return 'Renamed ' + action.oldPath + ' -> ' + action.newPath;
          } else {
            return 'ERROR: rename failed: ' + (renameResult.error || 'unknown');
          }
        case 'ask':
          hasAsk = true;
          return null;
        case 'done':
          hasDone = true;
          return null;
      }
    })();
  });

  var results = await Promise.all(promises);
  feedbacks = results.filter(function(f) { return f !== null; });

  return { feedbacks: feedbacks, hasAsk: hasAsk, hasDone: hasDone };
}

async function sendFeedback(actions, feedbacks) {
  var actionLabels = actions.map(function(a) { return a.type; }).filter(function(t, i, a) { return a.indexOf(t) === i; });
  var fbParts = [];
  for (var fi = 0; fi < feedbacks.length; fi++) {
    var label = fi < actionLabels.length ? "Output of '" + actionLabels[fi] + "':" : "Output:";
    fbParts.push(label + '\n' + feedbacks[fi]);
  }
  var feedbackText = fbParts.join('\n\n');
  bridgeLog('Sending ' + feedbacks.length + ' result(s) back to model');
  addLogEntry('send', feedbacks.length + ' result(s) sent to model');
  for (var fi2 = 0; fi2 < feedbacks.length; fi2++) {
    var preview = feedbacks[fi2].replace(/\n/g, ' ').substring(0, 100);
    addLogEntry('info', '  \u2514 ' + preview);
  }
  updatePanel('working');
  showToast('Results sent to model', 'info');
  var sent = await sendText(feedbackText);
  if (sent) {
    markLastSent();
  }
}

// ── Startup helpers ──────────────────────────────────────────────
async function waitForChatReady(timeoutMs) {
  var start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (allItems().length > 0) return true;
    await sleep(100);
  }
  return false;
}

async function sendSystemPrompt() {
  var prompt = SYSTEM_PROMPT.concat();
  // Inject active project info
  for (var pi = 0; pi < prompt.length; pi++) {
    prompt[pi] = prompt[pi].replace('{{ACTIVE_PROJECT}}', activeProject);
    prompt[pi] = prompt[pi].replace('{{KNOWN_PROJECTS}}', knownProjects.length > 0 ? knownProjects.join(', ') : activeProject);
  }
  // Inject custom prompt if saved
  try {
    var custom = await loadCustomPrompt();
    if (custom && custom.trim()) {
      prompt.push('', '--- USER CUSTOM INSTRUCTIONS ---', custom.trim());
    }
  } catch (e) {}
  var text = prompt.join('\n');
  var sent = await sendText(text);
  if (!sent) {
    await sleep(1000);
    sent = await sendText(text);
  }
  return sent;
}

// ── Agent control (ZeroScript-style) ────────────────────────────
async function startAgent() {
  bridgeLog('Starting agent session...');
  agentState = 'starting';
  updatePanel('starting');

  if (!bridgePanel) {
    injectStyles();
    createBridgePanel();
  }

  updatePanel('starting');
  agentState = 'working';
  setInputLock(true);
  updatePanel('working');

  addLogEntry('info', 'Bridge agent started');
  var sent = await sendSystemPrompt();
  if (sent) {
    markLastSent();
    requestAnimationFrame(function() { decorate.sweep(); });
    bridgeLog('System prompt sent, bridge ready');
    addLogEntry('send', 'System prompt sent to model');
    // Go straight to ready state
    agentState = 'ready';
    setInputLock(false);
    updatePanel('ready');
    if (agentLoopRunning) return;
    agentLoopRunning = true;
    runAgentLoop();
  } else {
    bridgeLog('System prompt failed, model may not understand bridge commands');
    agentState = 'ready';
    setInputLock(false);
    updatePanel('ready');
  }
}

async function runAgentLoop() {
  // Lock input for the ENTIRE agent loop. Only unlocked when loop ends.
  setInputLock(true);
  while (agentLoopRunning) {
    try {
      if (agentState === 'ready') {
        // Ready: briefly unlock so user can type, then immediately relock on detection
        setInputLock(false);
        updatePanel('ready');
        bridgeLog('Waiting for your message...');
        await waitForUserMessage();
        if (!agentLoopRunning) break;
        bridgeLog('New message detected');
        agentState = 'working';
        setInputLock(true);
        updatePanel('working');
      }

      if (agentState === 'working') {
        var res = await waitForResponse();
        if (!agentLoopRunning) break;

        if (res.kind === 'tool' && res.actions && res.actions.length > 0) {
          var actions = res.actions;
          var hasAsk = actions.some(function(a) { return a.type === 'ask'; });
          var hasDone = actions.some(function(a) { return a.type === 'done'; });

          if (hasAsk) {
            var askAction = actions.filter(function(a) { return a.type === 'ask'; })[0];
            var q = askAction.question || '';
            var opts = askAction.options || [];
            bridgeLog('Model asks: ' + q);
            showToast('Model asks: ' + q.substring(0, 80), 'warn');
            agentState = 'waiting';
            setInputLock(false);
            updatePanel('waiting');
            if (opts.length > 0) {
              showAskButtons(q, opts);
            }
            continue;
          }

          if (hasDone) {
            bridgeLog('Task complete');
            addLogEntry('done', 'Task complete');
            showToast('Task complete', 'success');
            // Decorate the item with done chip
            if (res.item) decorate.toolBox(res.item, actions.map(function(a) { return a.type; }).join(', '), 'done', 'complete');
            agentState = 'ready';
            updatePanel('ready');
            continue;
          }

          // Decorate the AI response with a running chip (full body, scrollable)
          if (res.item) decorate.toolBox(res.item, actions.map(function(a) { return a.type; }).join(', '), 'run', '', res.text);

          var result = await executeActions(actions);
          if (result.feedbacks.length > 0) {
            // Update chip to done (full body keeps scrollable content)
            if (res.item) decorate.toolBox(res.item, actions.map(function(a) { return a.type; }).join(', '), 'done', result.feedbacks.length + ' result(s)', res.text);
            await sendFeedback(actions, result.feedbacks);
            updatePanel('working');
            continue;
          } else {
            if (res.item) decorate.toolBox(res.item, actions.map(function(a) { return a.type; }).join(', '), 'done', 'no output', res.text);
            bridgeLog('No feedback to send');
            continue;
          }
        } else if (res.kind === 'text') {
          bridgeLog('Response: ' + res.text.substring(0, 80));
          // Text response = user-directed. Go to ready so user can respond.
          agentState = 'ready';
          updatePanel('ready');
        } else {
          bridgeLog('Response kind: ' + res.kind + ', returning to ready');
          agentState = 'ready';
          updatePanel('ready');
        }
      }

      if (agentState === 'waiting') {
        setInputLock(false);
        updatePanel('waiting');
        bridgeLog('Model needs your input...');
        await waitForUserMessage();
        if (!agentLoopRunning) break;
        bridgeLog('Input received, continuing...');
        agentState = 'working';
        setInputLock(true);
        updatePanel('working');
      }
    } catch (err) {
      console.error('[ECB] Agent loop error:', err);
      agentState = 'ready';
      setInputLock(false);
      updatePanel('ready');
      await sleep(2000);
    }
  }
  // Loop ended — always unlock
  setInputLock(false);
}

// ── Connection monitoring ────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.action === 'connectionState') {
    var wasDisconnected = !_mcpConnected;
    _mcpConnected = msg.connected;
    if (msg.connected) {
      if (wasDisconnected) {
        bridgeLog('MCP server reconnected');
        updatePanel(agentState);
      }
    } else {
      updateConnectionStatus();
      if (agentLoopRunning) {
        bridgeLog('MCP server disconnected, retrying...');
      }
    }
  }
});

// Start health check in background
chrome.runtime.sendMessage({ action: 'startHealthCheck' }, function() {});

// ── Init ─────────────────────────────────────────────────────────
// ── Keyboard shortcut: Ctrl+Shift+. to stop agent ───────────────
document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.shiftKey && e.key === '.') {
    if (agentState === 'working' || agentState === 'waiting') {
      e.preventDefault();
      bridgeLog('Stopped by keyboard shortcut');
      stopBridge();
    }
  }
});

chrome.storage.local.get(['ecbLicenseKey', 'ecbDeviceId'], function(result) {
  if (result.ecbLicenseKey && result.ecbDeviceId) {
    licenseKey = result.ecbLicenseKey;
    console.log('[ECB] Found saved key, auto-validating...');
    // Auto-validate with device binding — skip wizard if valid
    var deviceId = result.ecbDeviceId;
    var email = getDeepSeekEmail();
    chrome.runtime.sendMessage({
      action: 'validateKey',
      key: result.ecbLicenseKey,
      deviceId: deviceId,
      email: email,
    }, function(response) {
      if (response && response.valid) {
        console.log('[ECB] Key still valid, skipping auth');
        saveKeyData(result.ecbLicenseKey, deviceId, email);
        startupSequence(result.ecbLicenseKey, true); // skipWizard
      } else if (response && response.expired) {
        console.log('[ECB] Key expired, showing renewal');
        createAuthModal();
      } else {
        console.log('[ECB] Key invalid, showing paywall');
        clearKeyData();
        createAuthModal();
      }
    });
  } else {
    console.log('[ECB] No saved key, showing paywall');
    createAuthModal();
  }
});
