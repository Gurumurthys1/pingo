// Pingo overlay renderer: a full-screen transparent canvas where Pingo lives,
// plus DOM bubbles/cards for anything with text or buttons.

(() => {
  const S = 5;            // sprite pixel scale
  const BS = 3;           // ball / glass / icon pixel scale
  const STAGE_FRACTION = 1 / 5; // where Pingo stands for events (1/5 of the screen)

  const ACCENTS = {
    whatsapp: '#25D366',
    telegram: '#2AABEE',
    sms: '#ffb703',
    email: '#ff6b6b',
  };
  const accentFor = (source) => ACCENTS[String(source).toLowerCase()] || '#a78bfa';

  const IDLE_LINES = [
    () => `${hi()} 👋`, () => 'Stay hydrated! 💧', () => "You're doing great!", () => 'Blink your eyes 👀',
    () => 'Stretch a little? 🙆', () => 'Psst... water? 💦', () => 'Posture check! 🪑',
    () => `${settings.buddyName} is here for you ✨`,
  ];

  const MEDIA_LABEL = {
    photo: 'PHOTO', video: 'VIDEO', voice: 'VOICE NOTE', audio: 'AUDIO', document: 'DOCUMENT',
    location: 'LOCATION', contact: 'CONTACT', sticker: 'STICKER', gif: 'GIF',
  };

  // ---------------------------------------------------------------- bridge
  // In Electron, preload.js exposes window.pingo. Opened in a normal browser,
  // we fake it and show a demo panel so the animations can be tried out.

  const bridge = window.pingo || makeDemoBridge();

  function makeDemoBridge() {
    document.body.classList.add('demo');
    let handler = () => {};
    let count = 2;
    const goal = 8;
    const panel = document.createElement('div');
    panel.className = 'demo-panel pixel-box';
    panel.innerHTML = `
      <b>PINGO DEMO</b>
      <span>Preview of the desktop overlay. In the app these are triggered by the tray, the timer or the notify API.</span>
      <button class="btn" data-a="notify">New message</button>
      <button class="btn" data-a="photo">Photo message</button>
      <button class="btn" data-a="voice">Voice note (group)</button>
      <button class="btn" data-a="private">Private (someone's watching)</button>
      <button class="btn" data-a="notify2">Message (Telegram)</button>
      <button class="btn" data-a="water">Water reminder</button>
      <button class="btn ghost" data-a="swap">Next character</button>
      <button class="btn ghost" data-a="poke">Poke buddy</button>`;
    document.body.appendChild(panel);
    const chars = Sprite.characterList();
    let ci = 0;
    panel.addEventListener('click', (e) => {
      const a = e.target.dataset.a;
      if (a === 'notify') handler({ type: 'notify', from: 'Priya', message: 'Hey! Are we still on for lunch at 1? 🍜', source: 'WhatsApp' });
      if (a === 'photo') handler({ type: 'notify', from: 'Priya', message: 'Look at this sunset!', media: 'photo', source: 'WhatsApp' });
      if (a === 'private') handler({ type: 'notify', from: 'Priya', message: 'How are you?', source: 'WhatsApp', gate: true });
      if (a === 'voice') handler({ type: 'notify', from: 'Amma · Family', message: '', media: 'voice', source: 'WhatsApp' });
      if (a === 'notify2') handler({ type: 'notify', from: 'Arjun Kumar', message: 'Deployed the build, can you check staging when you get a sec?', source: 'Telegram' });
      if (a === 'water') handler({ type: 'water', count, goal });
      if (a === 'poke') handler({ type: 'poke' });
      if (a === 'swap') {
        ci = (ci + 1) % chars.length;
        handler({ type: 'settings', petAlwaysVisible: true, character: chars[ci].id, buddyName: chars[ci].label, userName: 'Guru' });
      }
    });
    return {
      onEvent: (fn) => (handler = fn),
      ready: () => setTimeout(() => {
        handler({ type: 'settings', petAlwaysVisible: true, character: 'pingo', buddyName: 'Pingo', userName: 'Guru' });
        handler({ type: 'hello' });
      }, 300),
      setInteractive: () => {},
      waterDone: () => { count += 1; },
      waterSnooze: () => {},
      // demo: pretend the camera saw someone else, so the private card can be previewed
      faceCheck: async () => ({ verdict: 'others' }),
    };
  }

  // ---------------------------------------------------------------- canvas

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  const ui = document.getElementById('ui');
  let W = 0, H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  const groundY = () => H - 4;

  // ---------------------------------------------------------------- state

  const settings = { petAlwaysVisible: true, character: 'pingo', buddyName: 'Pingo', userName: '' };
  const hi = () => (settings.userName ? `Hi ${settings.userName}!` : 'Hi!');

  const pet = {
    x: -120, dir: 1,
    pose: 'idle', eyes: 'open', mouth: 'line',
    moving: false, target: null, speed: 160, arrive: null,
    walkT: 0, waveT: 0,
    jump: 0, jumpV: 0,
    blinkAt: 0, blinkUntil: 0,
    mark: 0, // time until which the "!" shows
  };

  let ball = null;
  let glass = null;
  let flash = 0;
  let settingsLoaded = false;
  const particles = [];
  const rings = [];
  const tweens = [];

  const spriteW = Sprite.GW * S;
  const spriteH = Sprite.GH * S;
  const petLeft = () => pet.x - spriteW / 2;
  const petTop = () => groundY() - spriteH - pet.jump;
  const onScreen = () => pet.x > -spriteW && pet.x < W + spriteW;

  // world position of a cell in Pingo's grid (accounts for facing direction)
  function gridToWorld(gx, gy) {
    const cx = pet.dir > 0 ? gx : Sprite.GW - 1 - gx;
    return { x: petLeft() + cx * S + S / 2, y: petTop() + gy * S + S / 2 };
  }

  // ---------------------------------------------------------------- timing helpers

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const rand = (a, b) => a + Math.random() * (b - a);

  function tween(ms, fn) {
    return new Promise((res) => tweens.push({ t0: performance.now(), ms, fn, res }));
  }

  function walkTo(x, speed = 160) {
    if (pet.arrive) pet.arrive(); // a new target cancels the old walk
    return new Promise((res) => {
      pet.target = x;
      pet.speed = speed;
      pet.moving = true;
      pet.arrive = res;
    });
  }

  function hop(power = 380) {
    if (pet.jump === 0) pet.jumpV = power;
  }

  async function enterStage() {
    if (!onScreen()) pet.x = -spriteW;
    pet.pose = 'idle';
    await walkTo(Math.round(W * STAGE_FRACTION), 260);
    pet.dir = 1;
  }

  // ---------------------------------------------------------------- job queue
  // Events play one after another so two messages never fight over Pingo.

  const queue = [];
  let busy = false;
  let nextWander = performance.now() + 6000;

  function enqueue(job) {
    queue.push(job);
    pump();
  }

  async function pump() {
    if (busy) return;
    busy = true;
    for (;;) {
      if (queue.length) {
        const job = queue.shift();
        try { await job(); } catch (err) { console.error(err); }
        pet.pose = 'idle'; pet.mouth = 'line'; pet.eyes = 'open';
        continue;
      }
      if (!settings.petAlwaysVisible && onScreen()) {
        pet.pose = 'idle';
        await walkTo(-spriteW * 1.5, 240);
        continue;
      }
      break;
    }
    busy = false;
    nextWander = performance.now() + rand(4000, 9000);
  }

  // ---------------------------------------------------------------- particles

  function burst(x, y, colors, n = 50, speed = [180, 560]) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed[0], speed[1]);
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120,
        g: 700, life: rand(0.7, 1.4), age: 0,
        size: Math.random() < 0.3 ? BS * 2 : BS,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  function floatText(text, x, y, color = '#fff') {
    particles.push({ kind: 'text', text, x, y, vx: 0, vy: -50, g: 0, life: 1.2, age: 0, color });
  }

  function hearts(x, y, n = 5) {
    for (let i = 0; i < n; i++)
      particles.push({ kind: 'heart', x: x + rand(-30, 30), y, vx: rand(-20, 20), vy: rand(-120, -70), g: -10, life: rand(1, 1.6), age: 0 });
  }

  // ---------------------------------------------------------------- DOM: bubbles + cards

  const active = new Set(); // DOM elements that follow Pingo

  function placeAbovePet(el, offsetX = -30, gap = 22) {
    // offset* sizes ignore the pop-in transform, so the box doesn't jump while scaling
    const w = el.offsetWidth, h = el.offsetHeight;
    const head = petTop() + S * 2;
    el.style.left = clamp(pet.x + offsetX, 10, W - w - 10) + 'px';
    el.style.top = Math.max(10, head - h - gap) + 'px';
  }

  function removeEl(el, cls = 'out', ms = 260) {
    if (!el.isConnected) return;
    el.classList.add(cls);
    active.delete(el);
    setTimeout(() => { el.remove(); hover.dom = false; syncInteractive(); }, ms);
  }

  function say(text, ms = 2200) {
    const el = document.createElement('div');
    el.className = 'bubble pixel-box';
    el.textContent = text;
    el.style.pointerEvents = 'none';
    ui.appendChild(el);
    active.add(el);
    placeAbovePet(el);
    return sleep(ms).then(() => removeEl(el, 'out', 180));
  }

  // Bubble with buttons. Resolves with the chosen value (or `fallback` on timeout).
  function ask({ title, text, meter, buttons, timeout, fallback }) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'bubble pixel-box interactive';
      if (title) el.appendChild(Object.assign(document.createElement('h4'), { textContent: title }));
      if (text) el.appendChild(Object.assign(document.createElement('div'), { textContent: text }));
      if (meter) {
        const m = document.createElement('div');
        m.className = 'meter';
        for (let i = 0; i < meter.goal; i++) {
          const d = document.createElement('i');
          if (i < meter.count) d.className = 'full';
          else if (i === meter.count) d.className = 'next';
          m.appendChild(d);
        }
        el.appendChild(m);
      }
      const row = document.createElement('div');
      row.className = 'actions';
      let timer;
      const finish = (v) => { clearTimeout(timer); removeEl(el, 'out', 180); resolve(v); };
      buttons.forEach(([label, value, ghost]) => {
        const b = document.createElement('button');
        b.className = 'btn' + (ghost ? ' ghost' : '');
        b.textContent = label;
        b.onclick = () => finish(value);
        row.appendChild(b);
      });
      el.appendChild(row);
      ui.appendChild(el);
      active.add(el);
      placeAbovePet(el);
      if (timeout) timer = setTimeout(() => finish(fallback), timeout);
    });
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
  }

  function colorFromName(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
    return `hsl(${h} 85% 65%)`;
  }

  function relTime(at) {
    if (!at) return 'now';
    const d = new Date(at);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // The message card that bursts out of the ball. Resolves when dismissed.
  // Pixel tile for photo / video / voice ... messages. Windows never gives us
  // the attachment itself, only WhatsApp's "📷 Photo" style label.
  function buildMediaTile(el, kind) {
    el.hidden = false;
    el.className = `media media-${kind}`;
    const art = Sprite.MEDIA_ART[kind];
    if (art) {
      const scale = 5;
      const cv = document.createElement('canvas');
      cv.width = art.rows[0].length * scale;
      cv.height = art.rows.length * scale;
      Sprite.drawPattern(cv.getContext('2d'), art.rows, art.colors, 0, 0, scale);
      const frame = document.createElement('div');
      frame.className = 'media-art';
      frame.appendChild(cv);
      el.appendChild(frame);
    } else {
      // voice / audio: bouncing equaliser bars
      const bars = document.createElement('div');
      bars.className = 'media-bars';
      for (let i = 0; i < 12; i++) {
        const b = document.createElement('i');
        b.style.animationDelay = `${(i * 97) % 600}ms`;
        bars.appendChild(b);
      }
      el.appendChild(bars);
    }
    const label = document.createElement('span');
    label.className = 'media-label';
    label.textContent = MEDIA_LABEL[kind] || 'ATTACHMENT';
    el.appendChild(label);
  }

  const LOCK_TEXT = {
    others: 'Someone else is with you, so I kept it private.',
    stranger: "That doesn't look like you. Message kept private.",
    nobody: "I couldn't see you at the screen. Message kept private.",
    error: 'Camera unavailable. Message kept private.',
  };

  // Privacy camera: snapshot a few frames and ask the main process who is there.
  // Anything other than a clear "owner" keeps the message text hidden.
  async function presenceCheck() {
    if (!bridge.faceCheck) return { verdict: 'error' };
    const timeout = sleep(7000).then(() => ({ verdict: 'error' }));
    const check = (async () => {
      try {
        const frames = window.pingo ? await Camera.snapshot() : [];
        return await bridge.faceCheck(frames);
      } catch (err) {
        console.warn('[pingo] camera check failed', err);
        return { verdict: 'error' };
      }
    })();
    return Promise.race([check, timeout]);
  }

  function showCard(ev) {
    return new Promise((resolve) => {
      const accent = accentFor(ev.source);
      const wrap = document.createElement('div');
      wrap.className = 'card-wrap interactive';
      wrap.style.setProperty('--accent', accent);
      wrap.style.setProperty('--life', '11s');
      wrap.innerHTML = `
        <div class="card">
          <div class="card-head">
            <span class="chip"><i></i><span class="src"></span></span>
            <span class="time"></span>
            <button class="x" title="Dismiss">×</button>
          </div>
          <div class="who">
            <div class="avatar"></div>
            <div><div class="from-label">NEW MESSAGE FROM</div><div class="from"></div></div>
          </div>
          <div class="media" hidden></div>
          <div class="msg typing"></div>
          <div class="card-foot"><span class="queue"></span><button class="btn ok">Got it</button></div>
          <div class="timer"><i></i></div>
        </div>
        <div class="tail"></div>`;

      wrap.querySelector('.src').textContent = ev.source.toUpperCase();
      wrap.querySelector('.time').textContent = relTime(ev.at);
      const av = wrap.querySelector('.avatar');
      av.textContent = initials(ev.from);
      av.style.setProperty('--avatar', colorFromName(ev.from));
      const from = wrap.querySelector('.from');
      [...ev.from].forEach((ch, i) => {
        const s = document.createElement('span');
        s.textContent = ch === ' ' ? ' ' : ch;
        s.style.animationDelay = 250 + i * 45 + 'ms';
        from.appendChild(s);
      });
      const pending = queue.filter((j) => j.kind === 'notify').length;
      if (pending) wrap.querySelector('.queue').textContent = `+${pending} MORE`;

      const msg = wrap.querySelector('.msg');
      const mediaEl = wrap.querySelector('.media');
      let typer = null;

      // typewriter for the message body (a media message may have no caption)
      const reveal = () => {
        msg.className = 'msg typing';
        if (ev.media) buildMediaTile(mediaEl, ev.media);
        if (ev.media && !ev.message) msg.hidden = true;
        const chars = [...(ev.message || (ev.media ? '' : '(no text)'))];
        let i = 0;
        clearInterval(typer);
        typer = setInterval(() => {
          i += 2;
          msg.textContent = chars.slice(0, i).join('');
          if (i >= chars.length) { clearInterval(typer); msg.classList.remove('typing'); }
        }, 22);
      };

      // privacy camera said "not just you": keep the text hidden, offer a re-check
      const lock = (verdict) => {
        msg.hidden = false;
        msg.className = 'msg locked';
        msg.textContent = `🔒 ${LOCK_TEXT[verdict] || LOCK_TEXT.error}`;
        const again = document.createElement('button');
        again.className = 'btn ghost again';
        again.textContent = 'Check again';
        again.onclick = async () => {
          again.disabled = true;
          again.textContent = 'Looking…';
          const p = await presenceCheck();
          if (p.verdict === 'owner') { again.remove(); reveal(); }
          else { msg.textContent = `🔒 ${LOCK_TEXT[p.verdict] || LOCK_TEXT.error}`; again.disabled = false; again.textContent = 'Check again'; }
        };
        wrap.querySelector('.card-foot').insertBefore(again, wrap.querySelector('.ok'));
      };

      if (ev.locked) lock(ev.locked);
      else reveal();

      ui.appendChild(wrap);
      active.add(wrap);
      placeAbovePet(wrap, -160, 6);

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(typer);
        const r = wrap.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, [accent, '#ffffff'], 24, [80, 260]);
        removeEl(wrap, 'out', 260);
        resolve();
      };
      wrap.querySelector('.x').onclick = close;
      wrap.querySelector('.ok').onclick = close;
      wrap.querySelector('.timer i').addEventListener('animationend', close);
    });
  }

  // ---------------------------------------------------------------- jobs

  async function helloJob() {
    await enterStage();
    pet.pose = 'wave'; pet.mouth = 'smile';
    await say(`${hi()} I'm ${settings.buddyName} 👋 I'll keep you hydrated and bring your messages.`, 3200);
  }

  // Played when the user picks another character in the control panel.
  async function swapJob() {
    if (!onScreen()) { await helloJob(); return; }
    const cx = pet.x, cy = petTop() + spriteH / 2;
    burst(cx, cy, ['#ffffff', '#ffd84d', '#a78bfa', '#2ec4b6'], 46, [120, 380]);
    rings.push({ x: cx, y: cy, age: 0, life: 0.45, color: '#ffffff', max: 110 });
    pet.renderAs = settings.character;
    hop(420);
    pet.pose = 'cheer'; pet.eyes = 'happy'; pet.mouth = 'smile';
    await say(`Ta-da! ${hi()} I'm ${settings.buddyName} now ✨`, 2600);
  }

  async function pokeJob() {
    if (!onScreen()) await enterStage();
    pet.mouth = 'smile'; pet.eyes = 'happy';
    hop(420);
    hearts(pet.x, petTop() + 20, 3);
    await say(IDLE_LINES[(Math.random() * IDLE_LINES.length) | 0](), 1800);
  }

  async function notifyJob(ev) {
    // privacy camera runs in parallel with the walk + ball roll (~2-3 s),
    // so the answer is ready by the time the ball bursts
    const presence = ev.gate ? presenceCheck() : null;
    await enterStage();
    // something is coming! look toward the far edge
    pet.dir = 1;
    pet.mouth = 'open';
    pet.mark = performance.now() + 900;
    hop(260);
    await sleep(450);

    const accent = accentFor(ev.source);
    const r = 8; // ball radius in BS cells
    const restY = groundY() - r * BS;
    ball = { x: W + 60, y: restY, r, sx: 1, sy: 1, color: accent, spin: 0 };

    // 1) roll + bounce in from the opposite edge
    const x0 = ball.x;
    const x1 = pet.x + 120;
    const dist = x0 - x1;
    const bounces = Math.max(3, Math.round(dist / 280));
    await tween(clamp(dist / 0.75, 900, 2600), (p) => {
      ball.x = x0 - dist * p;
      const phase = (p * bounces) % 1;
      const height = 150 * (1 - p * 0.6);
      ball.y = restY - Math.sin(phase * Math.PI) * height;
      const squash = phase < 0.08 || phase > 0.92;
      ball.sx = squash ? 1.25 : 0.92;
      ball.sy = squash ? 0.75 : 1.08;
      ball.spin -= 0.25;
      if (Math.random() < 0.6)
        particles.push({ x: ball.x + rand(-6, 6), y: ball.y + rand(-6, 6), vx: rand(20, 60), vy: rand(-20, 20), g: 0, life: 0.35, age: 0, size: BS, color: accent });
    });

    // 2) final leap into Pingo's raised hands
    pet.pose = 'catch';
    pet.mouth = 'open';
    const hand = gridToWorld(9, 5); // raised hands are on grid row 5
    const lx0 = ball.x, ly0 = ball.y;
    const lx1 = pet.x, ly1 = hand.y - r * BS - 6;
    await tween(520, (p) => {
      ball.x = lx0 + (lx1 - lx0) * p;
      ball.y = ly0 + (ly1 - ly0) * p - Math.sin(p * Math.PI) * 120;
      ball.sx = ball.sy = 1;
      ball.spin -= 0.3;
    });

    // 3) wobble... wobble... BLAST
    await tween(750, (p) => {
      const k = Math.sin(p * Math.PI * 6);
      ball.sx = 1 + 0.18 * k * p + 0.1 * p;
      ball.sy = 1 - 0.18 * k * p + 0.1 * p;
    });
    const bx = ball.x, by = ball.y;
    ball = null;
    rings.push({ x: bx, y: by, age: 0, life: 0.55, color: accent, max: 220 });
    rings.push({ x: bx, y: by, age: -0.08, life: 0.5, color: '#ffffff', max: 140 });
    burst(bx, by, [accent, '#ffffff', '#fff27a', accent], 70);
    if (ev.media === 'photo' || ev.media === 'video') flash = 1; // camera flash
    pet.pose = 'cheer';
    pet.eyes = 'happy';
    pet.mouth = 'smile';
    hop(300);

    // 4) the card itself
    if (presence) {
      const p = await presence;
      if (p.verdict !== 'owner') {
        ev = { ...ev, locked: p.verdict };
        pet.eyes = 'open';
        pet.mouth = 'line'; // shh... someone's watching
      }
    }
    const card = showCard(ev);
    await sleep(500);
    pet.pose = 'wave';
    const waveStop = sleep(2200).then(() => { if (pet.pose === 'wave') pet.pose = 'idle'; });
    await card;
    await waveStop;
    pet.eyes = 'open';
  }
  notifyJob.kind = 'notify';

  async function waterJob(ev) {
    await enterStage();
    pet.pose = 'hold';
    pet.mouth = 'smile';
    glass = { level: 0, mode: 'hand', tilt: 0, alpha: 1 };

    // droplets rain down into the glass while it fills
    const fill = tween(1800, (p) => { glass.level = 0.85 * easeOut(p); });
    for (let i = 0; i < 7; i++) {
      const g = glassRect();
      particles.push({ kind: 'drop', x: g.cx + rand(-6, 6), y: -20 - i * 70, vx: 0, vy: 300, g: 1600, life: 3, age: 0, stopY: g.top + 6 });
      await sleep(160);
    }
    await fill;

    const count = ev.count || 0;
    const goal = ev.goal || 8;
    const choice = await ask({
      title: settings.userName ? `${settings.userName.toUpperCase()}, SIP TIME!` : 'SIP TIME!',
      text: `Glass ${Math.min(count + 1, goal)} of ${goal} today. Take a few sips 💧`,
      meter: { count, goal },
      buttons: [['I drank it', 'done'], ['Snooze 10m', 'snooze', true]],
      timeout: 90_000,
      fallback: 'snooze',
    });

    if (choice === 'done') {
      bridge.waterDone();
      pet.pose = 'drink';
      glass.mode = 'mouth';
      pet.eyes = 'blink';
      await tween(1400, (p) => {
        glass.level = 0.85 * (1 - p);
        glass.tilt = Math.min(1, p * 3);
        if (Math.random() < 0.04) {
          const g = glassRect();
          floatText('gulp', g.cx + rand(-10, 20), g.top - 10, '#9be3ff');
        }
      });
      glass = null;
      pet.pose = 'cheer';
      pet.eyes = 'happy';
      hop(420);
      hearts(pet.x, petTop() + 10, 6);
      const total = count + 1;
      if (total >= goal) {
        burst(pet.x, petTop() - 20, ['#38b6ff', '#9be3ff', '#fff27a', '#ff8fa3'], 80);
        await say(`🎉 Daily goal reached! ${total}/${goal} glasses`, 3000);
      } else {
        await say(`Refreshed! ${total}/${goal} 💙`, 2000);
      }
    } else {
      bridge.waterSnooze();
      pet.mouth = 'line';
      const g = glassRect();
      burst(g.cx, g.top + 20, ['#9be3ff', '#ffffff'], 18, [60, 200]);
      glass = null;
      await say("Okay! I'll be back in 10 min ⏰", 2000);
    }
  }

  // ---------------------------------------------------------------- events

  bridge.onEvent((ev) => {
    switch (ev.type) {
      case 'settings': {
        const prevChar = settings.character;
        const prevName = settings.buddyName;
        settings.petAlwaysVisible = !!ev.petAlwaysVisible;
        if (ev.character) settings.character = ev.character;
        if (ev.buddyName) settings.buddyName = ev.buddyName;
        if (typeof ev.userName === 'string') settings.userName = ev.userName;
        if (!settingsLoaded) { settingsLoaded = true; pet.renderAs = settings.character; } // no swap anim on load
        else if (settings.character !== prevChar || settings.buddyName !== prevName) enqueue(swapJob);
        if (!busy) pump();
        break;
      }
      case 'hello': if (settings.petAlwaysVisible) enqueue(helloJob); break;
      case 'poke': enqueue(pokeJob); break;
      case 'water': enqueue(() => waterJob(ev)); break;
      case 'notify': {
        const job = () => notifyJob(ev);
        job.kind = 'notify';
        enqueue(job);
        break;
      }
    }
  });

  // ---------------------------------------------------------------- mouse / click-through

  const hover = { dom: false, pet: false };
  let interactive = false;

  function syncInteractive() {
    const v = hover.dom || hover.pet;
    if (v !== interactive) {
      interactive = v;
      bridge.setInteractive(v);
    }
    canvas.style.cursor = hover.pet ? 'pointer' : '';
  }

  function hitPet(x, y) {
    if (!onScreen()) return false;
    const l = petLeft(), t = petTop();
    return x > l + S * 2 && x < l + spriteW - S * 2 && y > t && y < t + spriteH;
  }

  document.addEventListener('mousemove', (e) => {
    hover.pet = hitPet(e.clientX, e.clientY);
    hover.dom = !!(e.target.closest && e.target.closest('.interactive'));
    syncInteractive();
  });
  document.addEventListener('mouseleave', () => { hover.pet = hover.dom = false; syncInteractive(); });
  canvas.addEventListener('click', (e) => {
    if (!hitPet(e.clientX, e.clientY)) return;
    if (busy) { hop(300); return; }
    enqueue(pokeJob);
  });

  // ---------------------------------------------------------------- update

  function update(dt, now) {
    // walking
    if (pet.moving && pet.target != null) {
      const dx = pet.target - pet.x;
      if (Math.abs(dx) < 3) {
        pet.x = pet.target;
        pet.moving = false;
        const r = pet.arrive; pet.arrive = null; r && r();
      } else {
        pet.dir = Math.sign(dx);
        pet.x += Math.sign(dx) * Math.min(Math.abs(dx), pet.speed * dt);
      }
    }
    pet.walkT = pet.moving ? pet.walkT + dt : 0;
    pet.waveT += dt;

    // jumping
    if (pet.jump > 0 || pet.jumpV > 0) {
      pet.jump += pet.jumpV * dt;
      pet.jumpV -= 1500 * dt;
      if (pet.jump <= 0) { pet.jump = 0; pet.jumpV = 0; }
    }

    flash = Math.max(0, flash - dt * 2.5);

    // blinking
    if (now > pet.blinkAt) { pet.blinkUntil = now + 130; pet.blinkAt = now + rand(2200, 5200); }

    // idle wandering when nothing is going on
    if (!busy && settings.petAlwaysVisible && now > nextWander) {
      nextWander = now + rand(5000, 11000);
      if (!onScreen()) enqueue(helloJob);
      else if (Math.random() < 0.65) walkTo(rand(W * 0.06, W * 0.94), rand(70, 120));
      else if (Math.random() < 0.5) hop(320);
      else pet.dir *= -1;
    }

    // tweens
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const p = clamp((now - t.t0) / t.ms);
      t.fn(p);
      if (p >= 1) { tweens.splice(i, 1); t.res(); }
    }

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'drop' && p.y >= p.stopY) {
        burst(p.x, p.stopY, ['#9be3ff', '#ffffff'], 5, [40, 140]);
        particles.splice(i, 1);
        continue;
      }
      if (p.age >= p.life) particles.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].age += dt;
      if (rings[i].age >= rings[i].life) rings.splice(i, 1);
    }

    // keep bubbles/cards glued above Pingo
    for (const el of active) {
      if (el.classList.contains('card-wrap')) placeAbovePet(el, -160, 6);
      else placeAbovePet(el);
    }
  }

  // ---------------------------------------------------------------- render

  function glassRect() {
    const w = 10 * BS, h = 13 * BS;
    if (glass && glass.mode === 'mouth') {
      const m = gridToWorld(13, 10);
      return { cx: m.x + pet.dir * 6, top: m.y - h / 2, w, h };
    }
    const hnd = gridToWorld(16, 14);
    return { cx: hnd.x + pet.dir * (w / 2 - 2), top: hnd.y - h + 10, w, h };
  }

  function drawGlass(now) {
    const g = glassRect();
    ctx.save();
    ctx.translate(g.cx, g.top + g.h / 2);
    ctx.rotate(-pet.dir * glass.tilt * 0.9);
    const x0 = -g.w / 2, y0 = -g.h / 2;
    const cols = 10, rows = 13;
    const inner = rows - 2;
    const filled = glass.level * inner;
    for (let cx = 0; cx < cols; cx++) {
      const wave = Math.round(Math.sin(now / 160 + cx * 0.9) * 0.6);
      for (let cy = 0; cy < rows; cy++) {
        const edge = cx === 0 || cx === cols - 1 || cy === rows - 1;
        const fromBottom = rows - 1 - cy;
        let col = null;
        if (edge) col = 'rgba(225,245,255,0.95)';
        else if (fromBottom <= filled + (filled > 0.5 ? wave : 0)) {
          const surface = fromBottom > filled - 1 + wave;
          col = surface ? '#9be3ff' : '#38b6ff';
        } else col = 'rgba(200,230,255,0.22)';
        ctx.fillStyle = col;
        ctx.fillRect(x0 + cx * BS, y0 + cy * BS, BS, BS);
      }
    }
    // glass shine + rising bubbles
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(x0 + BS * 2, y0 + BS * 2, BS, BS * 4);
    if (filled > 2) {
      for (let b = 0; b < 3; b++) {
        const t = ((now / 900 + b * 0.37) % 1);
        const by = y0 + (rows - 2) * BS - t * (filled - 1) * BS;
        ctx.fillRect(x0 + (3 + b * 2) * BS, Math.round(by), BS - 1, BS - 1);
      }
    }
    ctx.restore();
  }

  function drawBall(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.sx, b.sy);
    const r = b.r;
    const dark = shade(b.color, -0.45);
    const light = shade(b.color, 0.45);
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r + 0.3) continue;
        let col = b.color;
        if (d > r - 0.9) col = dark;
        else if (x + y > r * 0.6) col = shade(b.color, -0.2);
        else if (x + y < -r * 0.9) col = light;
        ctx.fillStyle = col;
        ctx.fillRect(x * BS - BS / 2, y * BS - BS / 2, BS, BS);
      }
    // chat glyph in the middle, wobbling with the spin
    ctx.rotate(Math.sin(b.spin) * 0.35);
    Sprite.drawPattern(ctx, Sprite.CHAT, { '#': '#ffffff' }, -3.5 * BS, -3.5 * BS, BS);
    ctx.restore();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function render(now) {
    ctx.clearRect(0, 0, W, H);

    // rings from the blast
    for (const r of rings) {
      if (r.age < 0) continue;
      const p = r.age / r.life;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = Math.max(1, 10 * (1 - p));
      ctx.beginPath();
      ctx.arc(r.x, r.y, easeOut(p) * r.max, 0, Math.PI * 2);
      ctx.stroke();
      if (p < 0.25) {
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.5 * (1 - p * 4);
        ctx.beginPath();
        ctx.arc(r.x, r.y, 60 + p * 200, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (onScreen()) {
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      const sw = 26 * (1 - Math.min(pet.jump, 120) / 240);
      ctx.beginPath();
      ctx.ellipse(pet.x, groundY() - 1, sw, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      const frame = pet.moving ? [1, 0, 2, 0][Math.floor(pet.walkT * 9) % 4] : 0;
      const state = {
        pose: pet.pose,
        frame,
        eyes: now < pet.blinkUntil && pet.eyes === 'open' ? 'blink' : pet.eyes,
        mouth: pet.mouth,
        waveFrame: pet.pose === 'wave' ? Math.floor(pet.waveT * 5) % 2 : 0,
      };
      const img = Sprite.frameCanvas(state, S, pet.dir, pet.renderAs || settings.character);
      const bob = frame ? -S : 0;
      ctx.drawImage(img, Math.round(petLeft()), Math.round(petTop() + bob));

      // name tag while the mouse is over the buddy
      if (hover.pet && !active.size) {
        ctx.font = '8px Pixel, Consolas, monospace';
        const label = settings.buddyName.toUpperCase();
        const tw = ctx.measureText(label).width + 14;
        const tx = Math.round(pet.x - tw / 2), ty = Math.round(petTop() - 24);
        ctx.fillStyle = '#1b1b2f';
        ctx.fillRect(tx - 2, ty, tw + 4, 18);
        ctx.fillRect(tx, ty - 2, tw, 22);
        ctx.fillStyle = '#fffaf0';
        ctx.fillRect(tx, ty, tw, 18);
        ctx.fillStyle = '#1b1b2f';
        ctx.textAlign = 'center';
        ctx.fillText(label, pet.x, ty + 13);
      }

      if (now < pet.mark) {
        const hop = Math.sin(now / 60) * 2;
        Sprite.drawPattern(ctx, Sprite.BANG, { '#': '#ffdd00' }, pet.x - BS * 2, petTop() - 40 + hop, BS * 2);
      }
      if (glass) drawGlass(now);
    }

    if (ball) drawBall(ball);

    // camera flash for photo/video messages
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.55 * flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // particles
    ctx.textAlign = 'center';
    for (const p of particles) {
      const a = clamp(1 - p.age / p.life);
      ctx.globalAlpha = a;
      if (p.kind === 'text') {
        ctx.font = '10px Pixel, Consolas, monospace';
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.kind === 'heart') {
        Sprite.drawPattern(ctx, Sprite.HEART, { '#': '#ff5d8f' }, p.x, p.y, 2);
      } else if (p.kind === 'drop') {
        ctx.globalAlpha = 1;
        Sprite.drawPattern(ctx, ['.#.', '###', '###', '.#.'], { '#': '#38b6ff' }, p.x - BS, p.y, BS);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- go

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // keep the loop alive even if one frame throws, so Pingo never freezes
    try {
      update(dt, now);
      render(now);
    } catch (err) {
      if (!loop.reported) { loop.reported = true; console.error('[pingo] frame error', err); window.__pingoFrameError = String(err && err.stack); }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  bridge.ready();
})();
