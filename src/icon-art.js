// Pingo's app icon: the beanie buddy peeking out of a chat bubble, with a green
// "new message" badge. Drawn on a 32x32 pixel grid; used for the tray (main.js)
// and for build/icon.png (scripts/make-icon.js).

const GRID = 32;

const PALETTE = {
  outline: [15, 19, 38, 255],
  bubble: [108, 92, 255, 255],
  bubbleShade: [78, 62, 214, 255],
  hat: [46, 196, 182, 255],
  hatDark: [26, 143, 133, 255],
  pom: [255, 122, 61, 255],
  skin: [247, 201, 160, 255],
  eye: [27, 27, 47, 255],
  shine: [255, 255, 255, 255],
  cheek: [255, 143, 163, 255],
  mouth: [138, 42, 59, 255],
  badge: [37, 211, 102, 255],
  badgeHi: [140, 245, 180, 255],
  off: [168, 175, 192, 255],
  offHi: [205, 210, 222, 255],
};

function layer() {
  return Array.from({ length: GRID }, () => new Array(GRID).fill(null));
}

function rect(l, x, y, w, h, c) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (l[j] && i >= 0 && i < GRID) l[j][i] = c;
}

function roundRect(l, x, y, w, h, r, c) {
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const dx = Math.max(r - i - 0.5, 0, i + 0.5 - (w - r));
      const dy = Math.max(r - j - 0.5, 0, j + 0.5 - (h - r));
      if (dx * dx + dy * dy <= r * r) l[y + j][x + i] = c;
    }
}

function circle(l, cx, cy, r, c) {
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) l[y][x] = c;
}

// Every empty cell touching a filled one becomes outline.
function outline(l, c) {
  const out = l.map((row) => row.slice());
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      if (l[y][x]) continue;
      const n = (yy, xx) => yy >= 0 && yy < GRID && xx >= 0 && xx < GRID && l[yy][xx];
      if (n(y - 1, x) || n(y + 1, x) || n(y, x - 1) || n(y, x + 1)) out[y][x] = c;
    }
  return out;
}

function grid({ stopped = false } = {}) {
  const P = PALETTE;

  // the buddy's head, peeking over the top of the bubble
  const face = layer();
  rect(face, 14, 1, 4, 2, P.pom);
  rect(face, 12, 3, 8, 1, P.hat);
  rect(face, 10, 4, 12, 4, P.hat);
  rect(face, 9, 8, 14, 2, P.hatDark);
  rect(face, 9, 10, 14, 9, P.skin);
  rect(face, 12, 12, 2, 3, P.eye); rect(face, 18, 12, 2, 3, P.eye);
  rect(face, 12, 12, 1, 1, P.shine); rect(face, 18, 12, 1, 1, P.shine);
  rect(face, 10, 15, 2, 1, P.cheek); rect(face, 20, 15, 2, 1, P.cheek);
  rect(face, 14, 16, 4, 1, P.mouth); rect(face, 13, 15, 1, 1, P.mouth); rect(face, 18, 15, 1, 1, P.mouth);

  // chat bubble in front, with "typing" dots and a tail at the bottom left
  const bubble = layer();
  const fill = stopped ? P.off : P.bubble;
  const shade = stopped ? P.offHi : P.bubbleShade;
  roundRect(bubble, 1, 18, 30, 11, 4, fill);
  rect(bubble, 3, 27, 26, 1, shade);
  rect(bubble, 5, 29, 4, 1, fill);
  rect(bubble, 4, 30, 2, 1, fill);
  for (const x of [8, 14, 20]) rect(bubble, x, 22, 4, 3, P.shine);

  // two little hands gripping the bubble's edge
  const hands = layer();
  rect(hands, 6, 16, 3, 3, P.skin);
  rect(hands, 23, 16, 3, 3, P.skin);

  // "new message" badge
  const badge = layer();
  circle(badge, 27, 5, 4.4, stopped ? P.off : P.badge);
  rect(badge, 25, 3, 2, 1, stopped ? P.offHi : P.badgeHi);
  rect(badge, 25, 4, 1, 1, stopped ? P.offHi : P.badgeHi);

  const g = layer();
  for (const l of [outline(face, P.outline), outline(bubble, P.outline), outline(hands, P.outline), outline(badge, P.outline)])
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (l[y][x]) g[y][x] = l[y][x];
  return g;
}

// RGBA (or BGRA for Electron bitmaps) pixels at any size, nearest-neighbour.
function pixels(size, { stopped = false, bgra = false } = {}) {
  const g = grid({ stopped });
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = g[Math.floor((y * GRID) / size)][Math.floor((x * GRID) / size)];
      if (!c) continue;
      const i = (y * size + x) * 4;
      if (bgra) { buf[i] = c[2]; buf[i + 1] = c[1]; buf[i + 2] = c[0]; }
      else { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
      buf[i + 3] = c[3];
    }
  return buf;
}

module.exports = { GRID, pixels };
