// Pingo - main process
// Owns the transparent overlay window, the control panel, the tray menu, the
// water-reminder timer and a tiny localhost HTTP endpoint other tools can use
// to push notifications.
//
// Command line:
//   Pingo.exe            start (or open the control panel if already running)
//   Pingo.exe --hidden   start without opening the control panel (used at login)
//   Pingo.exe --stop     pause the running Pingo
//   Pingo.exe --quit     close the running Pingo completely

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, session, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createChatWatcher } = require('./watchers/chat-watcher');
const { pixels: iconPixels } = require('./icon-art');
const faceid = require('./faceid');

const NOTIFY_PORT = 47321;
const SNOOZE_MIN = 10;
const LOGIN_ARGS = ['--hidden'];

let overlay = null;
let control = null;
let tray = null;
let settings = null;
let nextReminderAt = 0;
let quitting = false;
let chatStatus = 'off'; // off | starting | allowed | toasts-off | denied | restarting

const chatWatcher = createChatWatcher({
  onMessage: ({ from, message, source, at, media }) =>
    notify(from, settings.showPreview ? message : media ? '' : 'Sent you a message', source, at, media),
  onStatus: (s) => {
    chatStatus = s;
    if (control && !control.isDestroyed()) control.webContents.send('control:state', state());
  },
});

function syncChatWatcher() {
  if (settings.active && settings.notificationsOn && settings.chatWatch) chatWatcher.start();
  else chatWatcher.stop();
}

// ---------------------------------------------------------------- settings

const defaults = {
  active: true,          // master Start/Stop switch
  intervalMin: 45,
  dailyGoal: 8,
  paused: false,         // water reminders paused
  notificationsOn: true,
  chatWatch: true,       // read WhatsApp / Telegram toasts from Windows
  showPreview: true,     // show message text (off = sender name only)
  petAlwaysVisible: true,
  faceGate: false,       // privacy camera: only show message text when it's just the owner
  character: 'pingo',    // pingo | mira | dev
  buddyName: 'Pingo',
  userName: '',
  todayDate: '',
  todayCount: 0,
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...defaults };
  }
  rollDay();
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Could not save settings', err);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function rollDay() {
  if (settings.todayDate !== today()) {
    settings.todayDate = today();
    settings.todayCount = 0;
  }
}

function state() {
  rollDay();
  return {
    ...settings,
    startWithWindows: app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin,
    minutesToNext: settings.active && !settings.paused ? Math.max(0, Math.ceil((nextReminderAt - Date.now()) / 60_000)) : null,
    version: app.getVersion(),
    chatStatus,
    faceSamples: faceProfile.length,
  };
}

// ---------------------------------------------------------------- privacy camera
// Only the owner's face embeddings (128 numbers each) are stored, encrypted with
// Windows DPAPI via safeStorage. Camera frames are analysed in memory and dropped.

const ENROLL_TARGET = 15;
let faceProfile = [];
let enrolling = null; // embeddings collected during setup

function faceProfilePath() {
  return path.join(app.getPath('userData'), 'face-profile.bin');
}

function loadFaceProfile() {
  try {
    const json = safeStorage.decryptString(fs.readFileSync(faceProfilePath()));
    faceProfile = JSON.parse(json).embeddings || [];
  } catch {
    faceProfile = [];
  }
}

function saveFaceProfile(embeddings) {
  faceProfile = embeddings;
  if (!embeddings.length) {
    fs.rmSync(faceProfilePath(), { force: true });
    return;
  }
  const blob = safeStorage.encryptString(JSON.stringify({ version: 1, createdAt: Date.now(), embeddings }));
  fs.writeFileSync(faceProfilePath(), blob);
}

const toFrame = (f) => ({ data: new Uint8Array(f.data), width: f.width, height: f.height });
const faceBoxes = (faces, f) => faces.map((x) => x.box.map((v, i) => v / (i % 2 ? f.height : f.width)));

ipcMain.handle('face:check', async (_e, frames) => {
  if (!faceProfile.length) return { verdict: 'not-enrolled' };
  try {
    return await faceid.checkPresence(frames.map(toFrame), faceProfile);
  } catch (err) {
    console.error('face check failed', err);
    return { verdict: 'error' };
  }
});

ipcMain.handle('face:enroll-begin', async () => {
  enrolling = [];
  await faceid.load(); // warm up the models while the camera starts
  return { target: ENROLL_TARGET };
});

// One preview frame during setup: returns face boxes (0..1) and, when exactly
// one clear face is visible and `capture` is set, adds a sample.
ipcMain.handle('face:enroll-frame', async (_e, raw, capture) => {
  const frame = toFrame(raw);
  const faces = await faceid.detect(frame);
  let added = false, hint = '';
  if (faces.length === 0) hint = 'No face found. Look at the camera.';
  else if (faces.length > 1) hint = 'Only you should be in the picture.';
  else if (faces[0].box[2] < frame.width * 0.14) hint = 'Come a little closer.';
  else if (capture && enrolling && enrolling.length < ENROLL_TARGET) {
    enrolling.push(await faceid.embed(frame, faces[0].landmarks));
    added = true;
  }
  return { boxes: faceBoxes(faces, frame), added, hint, count: enrolling ? enrolling.length : 0, target: ENROLL_TARGET };
});

ipcMain.handle('face:enroll-save', () => {
  if (!enrolling || enrolling.length < ENROLL_TARGET) return { ok: false };
  saveFaceProfile(enrolling);
  enrolling = null;
  settings.faceGate = true; // turning on the feature is the point of setting it up
  changed();
  return { ok: true, samples: faceProfile.length };
});

ipcMain.on('face:enroll-cancel', () => { enrolling = null; });

ipcMain.handle('face:delete', () => {
  saveFaceProfile([]);
  settings.faceGate = false;
  changed();
  return { ok: true };
});

// Push any change everywhere it is shown: tray, control panel, overlay.
function changed() {
  saveSettings();
  syncChatWatcher();
  refreshTray();
  if (control && !control.isDestroyed()) control.webContents.send('control:state', state());
  pushSettings();
}

// ---------------------------------------------------------------- start / stop

function startPingo() {
  if (settings.active) return;
  settings.active = true;
  scheduleNext();
  if (overlay) overlay.showInactive();
  changed();
  send({ type: 'hello' });
}

function stopPingo() {
  if (!settings.active) return;
  settings.active = false;
  if (overlay) overlay.hide();
  changed();
}

// ---------------------------------------------------------------- overlay

function createOverlay() {
  const { workArea } = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    ...workArea,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setVisibleOnAllWorkspaces(true);
  // Clicks pass straight through to the desktop unless the cursor is over
  // something interactive (the renderer toggles this via pingo:interactive).
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => settings.active && overlay.showInactive());

  const fit = () => overlay && overlay.setBounds(screen.getPrimaryDisplay().workArea);
  screen.on('display-metrics-changed', fit);
  screen.on('display-added', fit);
  screen.on('display-removed', fit);
}

function send(event) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('pingo:event', event);
}

function pushSettings() {
  send({
    type: 'settings',
    petAlwaysVisible: settings.petAlwaysVisible,
    character: settings.character,
    buddyName: settings.buddyName,
    userName: settings.userName,
  });
}

// ---------------------------------------------------------------- control panel

// The panel is laid out at this size (landscape, no scrolling) and zoomed down
// as a whole on screens that are too small for it.
const PANEL = { width: 980, height: 560 };

function panelFit() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  // leave room for the window frame + title bar and a little breathing space
  const zoom = Math.min(1, (workArea.width - 48) / PANEL.width, (workArea.height - 72) / PANEL.height);
  return { zoom, width: Math.floor(PANEL.width * zoom), height: Math.floor(PANEL.height * zoom) };
}

function fitControl() {
  if (!control || control.isDestroyed()) return;
  const { zoom, width, height } = panelFit();
  control.setResizable(true);
  control.setContentSize(width, height);
  control.setResizable(false);
  control.webContents.setZoomFactor(zoom);
  control.center();
}

function openControl() {
  if (control && !control.isDestroyed()) {
    fitControl();
    control.show();
    control.focus();
    return;
  }
  const { width, height } = panelFit();
  control = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    title: 'Pingo',
    icon: appIcon(32),
    backgroundColor: '#1d2440',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'control-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  control.setMenu(null);
  control.loadFile(path.join(__dirname, 'renderer', 'control.html'));
  control.webContents.on('did-finish-load', fitControl);
  control.webContents.setVisualZoomLevelLimits(1, 1);
  screen.on('display-metrics-changed', fitControl);
  // Closing the panel only hides it; Pingo keeps running in the tray.
  control.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      control.hide();
    }
  });
}

const CHARACTERS = ['pingo', 'mira', 'dev'];
const cleanName = (s, max) => String(s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

ipcMain.handle('control:get', () => state());

ipcMain.on('control:set', (_e, patch) => {
  const allowed = ['intervalMin', 'dailyGoal', 'paused', 'notificationsOn', 'chatWatch', 'showPreview', 'petAlwaysVisible'];
  for (const k of allowed) if (k in patch) settings[k] = patch[k];
  if ('faceGate' in patch) settings.faceGate = !!patch.faceGate && faceProfile.length > 0;
  if (CHARACTERS.includes(patch.character)) settings.character = patch.character;
  if (typeof patch.buddyName === 'string') settings.buddyName = cleanName(patch.buddyName, 16) || 'Pingo';
  if (typeof patch.userName === 'string') settings.userName = cleanName(patch.userName, 20);
  if ('intervalMin' in patch || 'paused' in patch) scheduleNext();
  if ('startWithWindows' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.startWithWindows, args: LOGIN_ARGS });
  changed();
});

ipcMain.on('control:action', (_e, action) => {
  if (action === 'start') startPingo();
  if (action === 'stop') stopPingo();
  if (action === 'quit') app.quit();
  if (action === 'water' && settings.active) { scheduleNext(); remindWater(); }
  if (action === 'test' && settings.active) testNotify();
  if (action === 'notif-settings') shell.openExternal('ms-settings:notifications');
});

// ---------------------------------------------------------------- notifications

const MEDIA_KINDS = ['photo', 'video', 'voice', 'audio', 'document', 'location', 'contact', 'sticker', 'gif'];

function notify(from, message, source, at = Date.now(), media = null) {
  if (!settings.active || !settings.notificationsOn) return false;
  send({
    type: 'notify',
    from: String(from || 'Someone').slice(0, 40),
    message: String(message || '').slice(0, 280),
    source: String(source || 'WhatsApp').slice(0, 24),
    media: MEDIA_KINDS.includes(media) ? media : null,
    gate: settings.faceGate && faceProfile.length > 0, // overlay checks the camera before revealing text
    at,
  });
  return true;
}

function testNotify() {
  // the test always shows, even if real notifications are switched off
  send({ type: 'notify', from: 'Priya', message: 'Hey! Are we still on for lunch at 1? 🍜', source: 'WhatsApp', at: Date.now() });
}

function startNotifyServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${NOTIFY_PORT}`);
    const done = (code, body) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname !== '/notify') return done(404, { error: 'POST /notify {from, message, source}' });

    if (req.method === 'GET') {
      const q = url.searchParams;
      const delivered = notify(q.get('from'), q.get('message'), q.get('source'), Date.now(), q.get('media'));
      return done(200, { ok: true, delivered });
    }
    if (req.method !== 'POST') return done(405, { error: 'method not allowed' });

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const { from, message, source, media } = JSON.parse(raw || '{}');
        done(200, { ok: true, delivered: notify(from, message, source, Date.now(), media) });
      } catch {
        done(400, { error: 'invalid JSON' });
      }
    });
  });
  server.on('error', (err) => console.error('Notify server error:', err.message));
  // Localhost only: nothing outside this PC can push messages.
  server.listen(NOTIFY_PORT, '127.0.0.1');
}

// ---------------------------------------------------------------- water reminders

function scheduleNext(minutes = settings.intervalMin) {
  nextReminderAt = Date.now() + minutes * 60_000;
}

function remindWater() {
  rollDay();
  send({ type: 'water', count: settings.todayCount, goal: settings.dailyGoal });
}

function tick() {
  if (settings.active && !settings.paused && Date.now() >= nextReminderAt) {
    scheduleNext();
    remindWater();
  }
  // keep "next reminder in N min" fresh in the panel
  if (control && !control.isDestroyed() && control.isVisible()) control.webContents.send('control:state', state());
}

ipcMain.on('pingo:water-done', () => {
  rollDay();
  settings.todayCount += 1;
  scheduleNext();
  changed();
});

ipcMain.on('pingo:water-snooze', () => scheduleNext(SNOOZE_MIN));

ipcMain.on('pingo:interactive', (_e, on) => {
  if (!overlay) return;
  if (on) overlay.setIgnoreMouseEvents(false);
  else overlay.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.on('pingo:ready', () => {
  pushSettings();
  if (settings.active) send({ type: 'hello' });
});

// ---------------------------------------------------------------- icons + tray

// Buddy-in-a-chat-bubble icon (src/icon-art.js), built in memory so no icon
// files are needed. The 32px bitmap is registered as 2x so the tray stays
// crisp on high-DPI screens; the bubble turns grey while Pingo is stopped.
function appIcon(size = 16, stopped = false) {
  const px = size * 2;
  return nativeImage.createFromBitmap(iconPixels(px, { stopped, bgra: true }), { width: px, height: px, scaleFactor: 2 });
}

function refreshTray() {
  if (!tray) return;
  rollDay();
  const on = settings.active;
  const intervals = [20, 30, 45, 60, 90];
  const menu = Menu.buildFromTemplate([
    { label: `${settings.buddyName}  -  ${on ? 'running' : 'stopped'}  -  ${settings.todayCount}/${settings.dailyGoal} glasses`, enabled: false },
    { type: 'separator' },
    on
      ? { label: '■  Stop Pingo', click: stopPingo }
      : { label: '▶  Start Pingo', click: startPingo },
    { label: 'Open control panel', click: openControl },
    { type: 'separator' },
    { label: 'Drink water now', enabled: on, click: () => { scheduleNext(); remindWater(); } },
    { label: 'Send test notification', enabled: on, click: testNotify },
    { type: 'separator' },
    {
      label: 'Remind me every',
      submenu: intervals.map((m) => ({
        label: `${m} minutes`,
        type: 'radio',
        checked: settings.intervalMin === m,
        click: () => { settings.intervalMin = m; scheduleNext(); changed(); },
      })),
    },
    {
      label: 'Water reminders',
      type: 'checkbox',
      checked: !settings.paused,
      click: (item) => { settings.paused = !item.checked; scheduleNext(); changed(); },
    },
    {
      label: 'Message notifications',
      type: 'checkbox',
      checked: settings.notificationsOn,
      click: (item) => { settings.notificationsOn = item.checked; changed(); },
    },
    { type: 'separator' },
    { label: 'Quit Pingo', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setImage(appIcon(16, !on));
  tray.setToolTip(`${settings.buddyName} (${on ? 'running' : 'stopped'}) - ${settings.todayCount}/${settings.dailyGoal} glasses today`);
}

// ---------------------------------------------------------------- lifecycle

function handleArgs(argv, firstRun) {
  if (argv.includes('--quit')) return app.quit();
  if (argv.includes('--stop')) return stopPingo();
  if (!firstRun) startPingo();
  if (!argv.includes('--hidden')) openControl();
}

if (process.argv.includes('--quit') || process.argv.includes('--stop')) {
  // Only meant for an already-running Pingo: hand the args over and exit.
  if (app.requestSingleInstanceLock()) app.exit(0);
  else app.quit();
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    loadFaceProfile();
    if (!faceProfile.length) settings.faceGate = false;
    // launching the app always means "start"
    settings.active = true;
    saveSettings();

    // Camera access: video only, and only for Pingo's own local pages.
    const ownPage = (wc) => !!wc && wc.getURL().startsWith('file://');
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) =>
      cb(permission === 'media' && ownPage(wc) && (details.mediaTypes || []).every((t) => t === 'video')));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media' && ownPage(wc));
    createOverlay();
    tray = new Tray(appIcon(16));
    tray.on('click', openControl);
    refreshTray();
    startNotifyServer();
    scheduleNext();
    setInterval(tick, 15_000);
    syncChatWatcher();
    handleArgs(process.argv, true);
  });

  app.on('second-instance', (_e, argv) => handleArgs(argv, false));
  app.on('before-quit', () => { quitting = true; chatWatcher.stop(); });
  app.on('window-all-closed', (e) => e.preventDefault());
}
