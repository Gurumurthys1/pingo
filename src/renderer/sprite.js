// Buddy pixel art. Everything is drawn from code on a small grid and then
// scaled up, so there are no image assets to ship. Each character shares the
// same skeleton (poses, walk cycle) and brings its own head, outfit and palette.

const Sprite = (() => {
  const OUTLINE = '#1b1b2f';
  const EYE = '#1b1b2f';

  const GW = 18; // 16 art columns + 1px outline padding each side
  const GH = 26; // 24 art rows + padding

  // ------------------------------------------------------------ characters

  const CHARACTERS = {
    pingo: {
      label: 'Pingo',
      blurb: 'Beanie kid in a hoodie',
      c: {
        skin: '#f7c9a0', skinDark: '#e3a777', cheek: '#ff8fa3', mouth: '#8a2a3b',
        hair: '#4a2c1d', hat: '#2ec4b6', hatDark: '#1a8f85', pom: '#ffffff',
        top: '#ff7a3d', topDark: '#d9581f', trim: '#fff4e6',
        bottom: '#3d4f9f', shoe: '#ffffff', sole: '#2b2d42',
      },
      head(rect, c) {
        rect(7, 0, 2, 2, c.pom);
        rect(5, 2, 6, 1, c.hat);
        rect(4, 3, 8, 1, c.hat);
        rect(3, 4, 10, 1, c.hat);
        rect(3, 5, 10, 1, c.hatDark);
        face(rect, c, 3, 10);
        rect(3, 6, 1, 2, c.hair); rect(12, 6, 1, 2, c.hair);
      },
      torso(rect, c) {
        rect(4, 12, 8, 6, c.top);
        rect(5, 12, 6, 1, c.topDark);
        rect(6, 13, 1, 2, c.trim); rect(9, 13, 1, 2, c.trim);
        rect(5, 16, 6, 1, c.topDark);
        rect(4, 17, 8, 1, c.topDark);
      },
      features(rect, c, eyes) { stdEyes(rect, eyes); rect(4, 9, 1, 1, c.cheek); rect(11, 9, 1, 1, c.cheek); },
    },

    mira: {
      label: 'Mira',
      blurb: 'Long hair, kurta, big smile',
      c: {
        skin: '#d9a074', skinDark: '#bd8259', cheek: '#e8737f', mouth: '#a3324a',
        hair: '#231815', hairHi: '#4a332b', clip: '#ff6fb5',
        top: '#8e5cf7', topDark: '#6a3fd1', trim: '#ffd84d',
        bottom: '#f3e6d0', shoe: '#c0703a', sole: '#5b3420',
      },
      head(rect, c) {
        // hair falls behind the shoulders, so draw it first
        rect(2, 5, 2, 8, c.hair); rect(12, 5, 2, 8, c.hair);
        rect(5, 2, 6, 1, c.hair);
        rect(4, 3, 8, 1, c.hair);
        rect(3, 4, 10, 2, c.hair);
        rect(5, 3, 2, 1, c.hairHi); rect(4, 4, 2, 1, c.hairHi);
        rect(10, 3, 2, 1, c.clip);
        face(rect, c, 4, 8);
        rect(4, 6, 3, 1, c.hair); // side-swept fringe
      },
      torso(rect, c) {
        rect(4, 12, 8, 6, c.top);
        rect(3, 17, 10, 3, c.top);           // kurta flares past the hips
        rect(7, 12, 2, 1, c.skin);           // neckline
        rect(7, 13, 2, 1, c.trim);
        rect(6, 15, 1, 1, c.trim); rect(9, 15, 1, 1, c.trim); rect(7, 17, 2, 1, c.trim);
        rect(3, 19, 10, 1, c.topDark);       // embroidered hem
        rect(4, 19, 1, 1, c.trim); rect(7, 19, 2, 1, c.trim); rect(11, 19, 1, 1, c.trim);
      },
      features(rect, c, eyes) {
        stdEyes(rect, eyes);
        if (eyes === 'open') { rect(5, 7, 1, 1, EYE); rect(11, 7, 1, 1, EYE); } // lashes
        rect(10, 6, 2, 1, c.hair);                                              // brow
        rect(5, 9, 1, 1, c.cheek); rect(11, 9, 1, 1, c.cheek);
        rect(8, 9, 1, 1, c.skinDark);                                           // nose
      },
    },

    dev: {
      label: 'Dev',
      blurb: 'Glasses, shirt & tie',
      c: {
        skin: '#b97f58', skinDark: '#9a6441', cheek: '#b97f58', mouth: '#6e2a2a',
        hair: '#141414', hairHi: '#3a3a3a', frame: '#141414', lens: '#cfefff', stubble: '#8a5a3c',
        top: '#5aa9e6', topDark: '#3b86c4', collar: '#ffffff', tie: '#d62f4b', tieDark: '#a11d36', belt: '#3a2a1a',
        bottom: '#4b5161', shoe: '#2a1d14', sole: '#111111',
      },
      head(rect, c) {
        rect(2, 7, 1, 2, c.skin); rect(13, 7, 1, 2, c.skin); // ears
        rect(4, 1, 8, 1, c.hair);
        rect(3, 2, 10, 2, c.hair);
        rect(3, 4, 3, 1, c.hair); rect(9, 4, 4, 1, c.hair); // side part leaves a gap
        rect(8, 2, 3, 1, c.hairHi);
        rect(5, 1, 1, 1, c.hairHi);
        rect(3, 5, 10, 1, c.skin);                            // forehead
        rect(6, 4, 3, 1, c.skin);
        face(rect, c, 3, 10);
        rect(3, 4, 1, 4, c.hair); rect(12, 4, 1, 4, c.hair); // sideburns
        rect(4, 11, 8, 1, c.stubble);
        rect(3, 10, 1, 1, c.stubble); rect(12, 10, 1, 1, c.stubble);
      },
      torso(rect, c) {
        rect(4, 12, 8, 5, c.top);
        rect(4, 16, 8, 1, c.topDark);
        rect(5, 12, 2, 1, c.collar); rect(9, 12, 2, 1, c.collar);
        rect(7, 12, 2, 1, c.tieDark);
        rect(7, 13, 2, 3, c.tie); rect(7, 16, 2, 1, c.tieDark);
        rect(4, 17, 8, 1, c.belt);
      },
      features(rect, c, eyes) {
        rect(5, 6, 2, 1, c.hair); rect(9, 6, 3, 1, c.hair);      // brows
        rect(5, 7, 3, 1, c.frame); rect(9, 7, 3, 1, c.frame);    // glasses
        rect(8, 7, 1, 1, c.frame);
        rect(5, 8, 1, 1, c.frame); rect(9, 8, 1, 1, c.frame);
        rect(7, 8, 1, 1, c.lens); rect(11, 8, 1, 1, c.lens);
        if (eyes === 'happy') { rect(6, 8, 1, 1, c.skinDark); rect(10, 8, 1, 1, c.skinDark); }
        else if (eyes !== 'blink') { rect(6, 8, 1, 1, EYE); rect(10, 8, 1, 1, EYE); }
        rect(8, 9, 1, 1, c.skinDark);                            // nose
      },
    },
  };

  function face(rect, c, x0, w) {
    rect(x0, 6, w, 5, c.skin);
    rect(x0 + 1, 11, w - 2, 1, c.skin);
  }

  function stdEyes(rect, eyes) {
    if (eyes === 'blink') { rect(6, 8, 1, 1, EYE); rect(10, 8, 1, 1, EYE); }
    else if (eyes === 'happy') {
      rect(5, 8, 1, 1, EYE); rect(6, 7, 1, 1, EYE); rect(7, 8, 1, 1, EYE);
      rect(9, 8, 1, 1, EYE); rect(10, 7, 1, 1, EYE); rect(11, 8, 1, 1, EYE);
    } else { rect(6, 7, 1, 2, EYE); rect(10, 7, 1, 2, EYE); }
  }

  // ------------------------------------------------------------ frame builder

  // Build one frame as a 2D colour grid, then auto-outline it.
  function buildGrid({ pose = 'idle', frame = 0, eyes = 'open', mouth = 'line', waveFrame = 0 }, charId) {
    const ch = CHARACTERS[charId] || CHARACTERS.pingo;
    const c = ch.c;
    const g = Array.from({ length: GH }, () => new Array(GW).fill(null));
    const rect = (x, y, w, h, col) => {
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const gx = x + i + 1, gy = y + j + 1;
          if (gx >= 0 && gx < GW && gy >= 0 && gy < GH) g[gy][gx] = col;
        }
    };

    // Legs + shoes (drawn first so the top overlaps them)
    const leg = (x, top, h) => {
      rect(x, top, 2, h, c.bottom);
      rect(x, top + h, 3, 1, c.shoe);
      rect(x, top + h + 1, 3, 1, c.sole);
    };
    if (frame === 1) { leg(4, 18, 4); leg(10, 18, 3); }
    else if (frame === 2) { leg(4, 18, 3); leg(10, 18, 4); }
    else { leg(5, 18, 4); leg(9, 18, 4); }

    ch.torso(rect, c);
    ch.head(rect, c);
    ch.features(rect, c, eyes);

    if (mouth === 'open') rect(8, 9, 2, 2, c.mouth);
    else if (mouth === 'smile') { rect(7, 9, 1, 1, c.mouth); rect(8, 10, 2, 1, c.mouth); rect(10, 9, 1, 1, c.mouth); }
    else rect(8, 10, 2, 1, c.mouth);

    // Arms go last so raised hands sit in front of hair. "Right" = facing side.
    const sleeve = c.top, hand = c.skin;
    const armDownL = () => { rect(2, 13, 2, 4, sleeve); rect(2, 17, 2, 1, hand); };
    const armDownR = () => { rect(12, 13, 2, 4, sleeve); rect(12, 17, 2, 1, hand); };
    const armUpL = () => { rect(3, 12, 1, 1, sleeve); rect(1, 8, 2, 5, sleeve); rect(1, 7, 2, 1, hand); };
    const armUpR = (sway = 0) => {
      rect(12, 12, 1, 1, sleeve);
      rect(13, 9, 2, 4, sleeve);
      rect(13 + sway, 7, 2, 2, sleeve);
      rect(13 + sway, 6, 2, 1, hand);
    };

    switch (pose) {
      case 'wave':
        armDownL(); armUpR(waveFrame ? 1 : 0); break;
      case 'catch':
        // arms stretched high above the head to hold the ball
        rect(3, 12, 1, 1, sleeve); rect(1, 5, 2, 8, sleeve); rect(1, 4, 2, 1, hand);
        rect(12, 12, 1, 1, sleeve); rect(13, 5, 2, 8, sleeve); rect(13, 4, 2, 1, hand);
        break;
      case 'cheer':
        armUpL(); armUpR(0); break;
      case 'hold':
        armDownL(); rect(12, 13, 3, 2, sleeve); rect(15, 13, 1, 2, hand); break;
      case 'drink':
        armDownL(); rect(12, 11, 2, 4, sleeve); rect(12, 10, 2, 1, hand); break;
      default:
        armDownL(); armDownR();
    }

    // Auto outline: every empty cell touching a filled one becomes outline.
    const out = g.map((row) => row.slice());
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (g[y][x]) continue;
        const n = (yy, xx) => yy >= 0 && yy < GH && xx >= 0 && xx < GW && g[yy][xx];
        if (n(y - 1, x) || n(y + 1, x) || n(y, x - 1) || n(y, x + 1)) out[y][x] = OUTLINE;
      }
    return out;
  }

  const cache = new Map();

  // Returns a cached offscreen canvas for a given frame description.
  function frameCanvas(state, scale, dir, charId = 'pingo') {
    const key = [charId, state.pose, state.frame, state.eyes, state.mouth, state.waveFrame, scale, dir].join('|');
    let cv = cache.get(key);
    if (cv) return cv;
    const grid = buildGrid(state, charId);
    cv = document.createElement('canvas');
    cv.width = GW * scale;
    cv.height = GH * scale;
    const ctx = cv.getContext('2d');
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        const col = grid[y][x];
        if (!col) continue;
        ctx.fillStyle = col;
        const dx = dir > 0 ? x : GW - 1 - x;
        ctx.fillRect(dx * scale, y * scale, scale, scale);
      }
    cache.set(key, cv);
    return cv;
  }

  // Generic helper for small pixel icons described as strings.
  function drawPattern(ctx, rows, colors, x, y, scale) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const col = colors[row[i]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), scale, scale);
      }
    });
  }

  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  const CHAT = ['.#####.', '#######', '#######', '#######', '.#####.', '.##....', '#......'];
  const BANG = ['##', '##', '##', '##', '..', '##'];

  // Pixel art for media messages (photo, video, ...) shown inside the card.
  const MEDIA_ART = {
    photo: {
      rows: ['ssssssssssss', 'ssssssssyyss', 'sssssssyyyys', 'ssssssssyyss', 'sssgssssssss',
        'ssgggsssgsss', 'sgggggsgggss', 'gggggggggggg', 'GGGGGGGGGGGG', 'GGGGGGGGGGGG'],
      colors: { s: '#7fd3ff', y: '#ffd84d', g: '#3fbf6f', G: '#2a8f50' },
    },
    video: {
      rows: ['kwkwkwkwkwkw', 'kkkkkkkkkkkk', 'kkkkwkkkkkkk', 'kkkkwwkkkkkk', 'kkkkwwwkkkkk',
        'kkkkwwwkkkkk', 'kkkkwwkkkkkk', 'kkkkwkkkkkkk', 'kkkkkkkkkkkk', 'kwkwkwkwkwkw'],
      colors: { k: '#2b2d42', w: '#ffffff' },
    },
    document: {
      rows: ['wwwwwwwf..', 'wwwwwwwff.', 'wwwwwwwfff', 'wbbbbwwwww', 'wwwwwwwwww', 'wbbbbbbbww',
        'wwwwwwwwww', 'wbbbbbbbww', 'wwwwwwwwww', 'wbbbbbwwww', 'wwwwwwwwww', 'wwwwwwwwww'],
      colors: { w: '#ffffff', f: '#c9d3e0', b: '#8a94a8' },
    },
    location: {
      rows: ['..rrrrr..', '.rrrrrrr.', 'rrrwwwrrr', 'rrwwwwwrr', 'rrrwwwrrr', '.rrrrrrr.',
        '..rrrrr..', '...rrr...', '....r....', '.........', '..ggggg..'],
      colors: { r: '#ff5d5d', w: '#ffffff', g: 'rgba(0,0,0,0.35)' },
    },
    sticker: {
      rows: ['.....y.....', '....yyy....', '....yyy....', 'yyyyyyyyyyy', '.yykyyykyy.',
        '..yyyyyyy..', '..yyoooyy..', '.yyyy.yyyy.', '.yyy...yyy.', 'yy.......yy'],
      colors: { y: '#ffd84d', k: '#1b1b2f', o: '#ff8f5d' },
    },
    contact: {
      rows: ['...pppp...', '..pppppp..', '..pppppp..', '..pppppp..', '...pppp...', '..........',
        '..bbbbbb..', '.bbbbbbbb.', 'bbbbbbbbbb', 'bbbbbbbbbb'],
      colors: { p: '#f7c9a0', b: '#5aa9e6' },
    },
    gif: {
      rows: ['kkkkkkkkkkkk', 'kggkkwkwwwkk', 'kgkkkwkwkkkk', 'kgkgkwkwwkkk', 'kgkgkwkwkkkk', 'kggkkwkwkkkk', 'kkkkkkkkkkkk'],
      colors: { k: '#a78bfa', g: '#ffffff', w: '#ffffff' },
    },
  };

  const characterList = () =>
    Object.entries(CHARACTERS).map(([id, ch]) => ({ id, label: ch.label, blurb: ch.blurb }));

  return { GW, GH, frameCanvas, drawPattern, HEART, CHAT, BANG, MEDIA_ART, characterList };
})();
