// Watches Windows toast notifications from chat apps (WhatsApp Desktop,
// Telegram...) and reports each new message as { from, message, source }.
// The heavy lifting is notification-listener.ps1, run under Windows PowerShell
// so we can use the WinRT UserNotificationListener API without native modules.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const APPS = [
  { source: 'WhatsApp', match: /whatsapp/i },
  { source: 'Telegram', match: /telegram/i },
];

// Read through fs (works inside app.asar) and pass the script inline, since
// powershell.exe itself can't open files packed in the asar archive.
function encodedScript() {
  const text = fs.readFileSync(path.join(__dirname, 'notification-listener.ps1'), 'utf8');
  return Buffer.from(text, 'utf16le').toString('base64');
}

// Windows only hands us the toast's text, never the attached picture, so media
// messages are recognised from the label WhatsApp puts in the text
// ("📷 Photo", "📷 caption", "🎤 Voice message", ...).
const MEDIA = [
  { kind: 'photo', re: /^(?:📷|📸|🖼️?)\s*([\s\S]*)$/u, words: /^(photo|image)$/i },
  { kind: 'video', re: /^(?:🎥|📹|🎬)\s*([\s\S]*)$/u, words: /^video$/i },
  { kind: 'voice', re: /^(?:🎤|🎙️?)\s*([\s\S]*)$/u, words: /^(voice (message|note)|audio message)/i },
  { kind: 'audio', re: /^(?:🎵|🎧)\s*([\s\S]*)$/u, words: /^audio$/i },
  { kind: 'document', re: /^(?:📄|📎|📁|📃|📑)\s*([\s\S]*)$/u, words: /^document$/i },
  { kind: 'location', re: /^📍\s*([\s\S]*)$/u, words: /^(live )?location$/i },
  { kind: 'contact', re: /^(?:👤|📇)\s*([\s\S]*)$/u, words: /^contact( card)?$/i },
  { kind: 'sticker', re: /^(?:🎟️?|💟)?\s*(sticker)$/iu, words: /^sticker$/i },
  { kind: 'gif', re: /^(?:👾)?\s*(GIF)$/iu, words: /^gif$/i },
];

function detectMedia(message) {
  for (const m of MEDIA) {
    if (m.words.test(message)) return { media: m.kind, caption: '' };
    const hit = message.match(m.re);
    if (hit) {
      const rest = (hit[1] || '').trim();
      return { media: m.kind, caption: m.words.test(rest) ? '' : rest };
    }
  }
  return null;
}

// Turn the toast's text lines into sender + message.
// WhatsApp: ["Priya", "Lunch at 1?"]  or for groups ["Family", "Amma: Dinner ready"]
function parse(texts, source) {
  const lines = (texts || []).map((t) => String(t).trim()).filter(Boolean);
  if (!lines.length) return null;
  if (lines.length === 1) return { from: source, message: lines[0] };
  let from = lines[0];
  let message = lines.slice(1).join('\n');
  const group = message.match(/^([^:\n]{1,40}):\s+([\s\S]+)$/);
  if (group) {
    from = `${group[1]} · ${lines[0]}`;
    message = group[2];
  }
  const media = detectMedia(message);
  if (media) return { from, message: media.caption, media: media.media };
  return { from, message };
}

function createChatWatcher({ onMessage, onStatus }) {
  let child = null;
  let wanted = false;
  let restartTimer = null;

  function launch() {
    clearTimeout(restartTimer);
    if (!wanted || child) return;
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript()],
      { windowsHide: true }
    );
    onStatus('starting');
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try { msg = JSON.parse(line); } catch { return; }
      if (msg.status) return onStatus(msg.status);
      if (msg.error) return console.error('[chat-watcher]', msg.error);
      const app = APPS.find((a) => a.match.test(`${msg.app} ${msg.aumid}`));
      if (!app) return;
      const parsed = parse(msg.texts, app.source);
      if (parsed) onMessage({ ...parsed, source: app.source, at: msg.time || Date.now(), avatar: msg.avatar || null });
    });
    child.stderr.on('data', (d) => {
      const text = String(d).trim();
      if (text && !text.startsWith('#< CLIXML')) console.error('[chat-watcher]', text);
    });
    child.on('exit', (code) => {
      child = null;
      if (code === 2) return onStatus('denied'); // no notification access: don't spin
      if (wanted) {
        onStatus('restarting');
        restartTimer = setTimeout(launch, 5000);
      } else {
        onStatus('off');
      }
    });
  }

  return {
    start() { wanted = true; launch(); },
    stop() {
      wanted = false;
      clearTimeout(restartTimer);
      if (child) child.kill();
      else onStatus('off');
    },
  };
}

module.exports = { createChatWatcher, parse };
