// Pingo control panel: Start/Stop and settings.

(() => {
  // Opened in a plain browser there is no bridge; fake one so the page can be previewed.
  const api = window.pingoControl || (() => {
    let s = { active: true, paused: false, notificationsOn: true, petAlwaysVisible: true, startWithWindows: false,
      intervalMin: 45, dailyGoal: 8, todayCount: 3, minutesToNext: 32, version: 'demo',
      chatWatch: true, showPreview: true, chatStatus: 'allowed',
      character: 'pingo', buddyName: 'Pingo', userName: 'Guru' };
    let fn = () => {};
    return {
      get: async () => s,
      set: (p) => { s = { ...s, ...p }; fn(s); },
      action: (a) => { if (a === 'start') s.active = true; if (a === 'stop') s.active = false; fn(s); },
      onState: (f) => (fn = f),
      faceEnrollBegin: async () => ({}), faceEnrollFrame: async () => ({ boxes: [] }), faceEnrollSave: async () => ({}),
      faceEnrollCancel: () => {}, faceCheck: async () => ({ verdict: 'error' }), faceDelete: async () => ({}),
    };
  })();

  const $ = (id) => document.getElementById(id);
  let current = null;

  // character picker cards
  const CHARS = Sprite.characterList();
  const labelOf = (id) => (CHARS.find((c) => c.id === id) || CHARS[0]).label;
  const cards = CHARS.map((ch) => {
    const b = document.createElement('button');
    b.className = 'char';
    b.dataset.id = ch.id;
    const cv = document.createElement('canvas');
    const img = Sprite.frameCanvas({ pose: 'idle', frame: 0, eyes: 'open', mouth: 'smile', waveFrame: 0 }, 3, 1, ch.id);
    cv.width = img.width; cv.height = img.height;
    cv.getContext('2d').drawImage(img, 0, 0);
    b.append(cv, Object.assign(document.createElement('b'), { textContent: ch.label.toUpperCase() }),
      Object.assign(document.createElement('small'), { textContent: ch.blurb }));
    b.onclick = () => {
      if (!current || current.character === ch.id) return;
      // keep a custom name, but follow the default name when switching characters
      const keepName = current.buddyName && current.buddyName !== labelOf(current.character);
      api.set({ character: ch.id, buddyName: keepName ? current.buddyName : ch.label });
    };
    $('chars').appendChild(b);
    return b;
  });

  function render(s) {
    current = s;
    const on = s.active;
    cards.forEach((c) => c.classList.toggle('on', c.dataset.id === s.character));
    $('title').textContent = (s.buddyName || 'Pingo').toUpperCase();
    if (document.activeElement !== $('buddyName')) $('buddyName').value = s.buddyName || '';
    if (document.activeElement !== $('userName')) $('userName').value = s.userName || '';
    $('buddyName').placeholder = labelOf(s.character);
    document.body.classList.toggle('stopped', !on);
    $('status').textContent = on ? 'RUNNING' : 'STOPPED';
    $('status').className = 'pill ' + (on ? 'on' : 'off');
    $('power').textContent = on ? '■  STOP PINGO' : '▶  START PINGO';
    $('power').className = 'power ' + (on ? 'stop' : 'start');

    if (!on) $('sub').textContent = 'Pingo is resting. No reminders or messages.';
    else if (s.paused) $('sub').textContent = 'Water reminders are paused.';
    else if (s.minutesToNext != null) $('sub').textContent = `Next water break in ${s.minutesToNext} min`;

    $('today').textContent = `${s.todayCount}/${s.dailyGoal}`;
    const meter = $('meter');
    meter.innerHTML = '';
    for (let i = 0; i < s.dailyGoal; i++) {
      const d = document.createElement('i');
      if (i < s.todayCount) d.className = 'full';
      meter.appendChild(d);
    }

    const chat = {
      allowed: ['● Watching WhatsApp', 'ok'],
      starting: ['Connecting…', ''],
      restarting: ['Reconnecting…', 'warn'],
      'toasts-off': ['Windows notifications are OFF', 'warn'],
      denied: ['No notification access', 'warn'],
      off: ['Off', ''],
    }[s.chatStatus] || ['Off', ''];
    const chatLive = on && s.notificationsOn && s.chatWatch;
    $('chatStatus').textContent = chatLive ? chat[0] : 'Off';
    $('chatStatus').className = 'chat-status ' + (chatLive ? chat[1] : '');
    $('notifSettings').hidden = !(chatLive && (s.chatStatus === 'toasts-off' || s.chatStatus === 'denied'));
    $('chat').checked = s.chatWatch;
    $('preview').checked = s.showPreview;

    const samples = s.faceSamples || 0;
    $('faceStatus').textContent = samples ? `● Face saved (${samples} samples)` : 'Not set up';
    $('faceStatus').className = 'chat-status ' + (samples ? 'ok' : '');
    $('faceGate').checked = !!s.faceGate;
    $('faceGate').disabled = !samples;
    $('faceSetup').textContent = samples ? 'Redo' : 'Set up';
    $('faceTest').disabled = !samples;
    $('faceDelete').disabled = !samples;

    $('water').checked = !s.paused;
    $('notify').checked = s.notificationsOn;
    $('visible').checked = s.petAlwaysVisible;
    $('login').checked = s.startWithWindows;
    $('interval').value = String(s.intervalMin);
    $('goal').value = String(s.dailyGoal);
    $('drink').disabled = !on;
    $('test').disabled = !on;
    $('version').textContent = 'v' + s.version;
  }

  $('power').onclick = () => api.action(current && current.active ? 'stop' : 'start');
  $('quit').onclick = () => api.action('quit');
  $('drink').onclick = () => api.action('water');
  $('test').onclick = () => api.action('test');
  $('buddyName').onchange = (e) => api.set({ buddyName: e.target.value.trim() || labelOf(current.character) });
  $('userName').onchange = (e) => api.set({ userName: e.target.value.trim() });
  for (const id of ['buddyName', 'userName']) $(id).onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  $('chat').onchange = (e) => api.set({ chatWatch: e.target.checked });
  $('preview').onchange = (e) => api.set({ showPreview: e.target.checked });
  $('notifSettings').onclick = () => api.action('notif-settings');
  $('water').onchange = (e) => api.set({ paused: !e.target.checked });
  $('notify').onchange = (e) => api.set({ notificationsOn: e.target.checked });
  $('visible').onchange = (e) => api.set({ petAlwaysVisible: e.target.checked });
  $('login').onchange = (e) => api.set({ startWithWindows: e.target.checked });
  $('interval').onchange = (e) => api.set({ intervalMin: Number(e.target.value) });
  $('goal').onchange = (e) => api.set({ dailyGoal: Number(e.target.value) });

  api.onState(render);
  api.get().then(render);

  // ---------------------------------------------------------------- privacy camera

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const video = $('camVideo');
  const overlay = $('camOverlay');
  const RESULT = {
    owner: ['✓ It\'s you! Messages will show in full.', 'ok'],
    others: ['Someone else is in view: messages would stay private.', 'warn'],
    stranger: ['✗ Not recognised: messages would stay private.', 'warn'],
    nobody: ['No face found. Sit in front of the camera.', 'warn'],
    error: ['The check failed. Try again.', 'warn'],
  };
  let cam = null, mode = null, looping = false, capturing = false, saved = false;

  function say(text, cls = '') { $('faceMsg').textContent = text; $('faceMsg').className = 'face-msg ' + cls; }

  function drawBoxes(boxes) {
    overlay.width = overlay.clientWidth;
    overlay.height = overlay.clientHeight;
    const c = overlay.getContext('2d');
    c.clearRect(0, 0, overlay.width, overlay.height);
    c.lineWidth = 3;
    c.strokeStyle = boxes.length === 1 ? '#2ee59d' : '#ffb703';
    for (const [x, y, w, h] of boxes) c.strokeRect(x * overlay.width, y * overlay.height, w * overlay.width, h * overlay.height);
  }

  async function openFace(m) {
    mode = m; saved = false; capturing = false;
    $('faceModal').hidden = false;
    $('faceTitle').textContent = m === 'setup' ? 'SET UP MY FACE' : 'TEST THE CAMERA CHECK';
    $('faceHelp').textContent = m === 'setup'
      ? 'Look at the screen. When you press Start, slowly turn your head a little left, right, up and down. Only you should be in the picture.'
      : 'Sit like you normally do and press Test. Try it with someone next to you too.';
    $('faceGo').textContent = m === 'setup' ? 'START' : 'TEST NOW';
    $('faceGo').disabled = true;
    $('faceBar').style.width = '0%';
    $('faceBar').parentElement.hidden = m !== 'setup';
    say('Starting camera…');
    if (!window.pingoControl) return say('The camera only works inside the Pingo app.', 'warn');
    try {
      cam = await Camera.open(video);
    } catch (err) {
      return say('Could not open the camera. Check Windows Settings → Privacy & security → Camera.', 'warn');
    }
    $('camRec').hidden = false;
    if (m === 'setup') await api.faceEnrollBegin();
    $('faceGo').disabled = false;
    say('');
    looping = true;
    previewLoop();
  }

  async function previewLoop() {
    while (looping) {
      const frame = Camera.grab(video);
      if (frame) {
        const r = await api.faceEnrollFrame(frame, capturing);
        if (!looping) break;
        drawBoxes(r.boxes);
        if (capturing) {
          $('faceBar').style.width = `${(100 * r.count) / r.target}%`;
          say(r.hint || `Got ${r.count} of ${r.target}. Keep turning slowly…`, r.hint ? 'warn' : '');
          if (r.count >= r.target) {
            capturing = false;
            const res = await api.faceEnrollSave();
            saved = res.ok;
            say(res.ok ? '✓ Saved! The privacy camera is now ON.' : 'Could not save. Try again.', res.ok ? 'ok' : 'warn');
            $('faceGo').textContent = 'DONE';
            $('faceGo').disabled = false;
          }
        } else if (mode === 'setup' && !saved) {
          say(r.hint || 'Face found. Press Start when ready.', r.hint ? 'warn' : 'ok');
        }
      }
      await sleep(capturing ? 220 : 140);
    }
  }

  function closeFace() {
    looping = false; capturing = false;
    Camera.stop(cam); cam = null;
    video.srcObject = null;
    $('camRec').hidden = true;
    drawBoxes([]);
    if (mode === 'setup' && !saved && window.pingoControl) api.faceEnrollCancel();
    $('faceModal').hidden = true;
  }

  $('faceGo').onclick = async () => {
    if (mode === 'setup') {
      if (saved) return closeFace();
      capturing = true;
      $('faceGo').disabled = true;
      say('Capturing… keep turning your head slowly.');
      return;
    }
    // test: same check the overlay runs when a message arrives
    $('faceGo').disabled = true;
    say('Looking…');
    const frames = [];
    for (let i = 0; i < 3; i++) { const f = Camera.grab(video); if (f) frames.push(f); await sleep(160); }
    const r = await api.faceCheck(frames);
    const [text, cls] = RESULT[r.verdict] || RESULT.error;
    say(`${text}${r.bestSimilarity != null ? ` (match ${Math.round(r.bestSimilarity * 100)}%)` : ''}`, cls);
    $('faceGo').disabled = false;
  };
  $('faceClose').onclick = closeFace;
  $('faceSetup').onclick = () => openFace('setup');
  $('faceTest').onclick = () => openFace('test');
  $('faceDelete').onclick = async () => {
    if (!confirm('Delete your saved face data? The privacy camera will turn off.')) return;
    await api.faceDelete();
  };
  $('faceGate').onchange = (e) => api.set({ faceGate: e.target.checked });

  // little Pingo in the header: waves while running, sleeps when stopped
  const cv = $('buddy');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  function draw(now) {
    const on = !current || current.active;
    const state = on
      ? { pose: 'wave', frame: 0, eyes: now % 3200 < 140 ? 'blink' : 'open', mouth: 'smile', waveFrame: Math.floor(now / 220) % 2 }
      : { pose: 'idle', frame: 0, eyes: 'blink', mouth: 'line', waveFrame: 0 };
    const img = Sprite.frameCanvas(state, 4, 1, (current && current.character) || 'pingo');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const bob = on ? Math.round(Math.sin(now / 300) * 2) : 0;
    ctx.drawImage(img, (cv.width - img.width) / 2, cv.height - img.height - 6 + bob);
    if (!on) {
      ctx.fillStyle = '#9aa3c7';
      ctx.font = '10px Pixel, Consolas';
      const z = Math.floor(now / 600) % 3;
      ctx.fillText('z', 66, 30 - z * 6);
      if (z > 0) ctx.fillText('z', 74, 22 - z * 4);
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
