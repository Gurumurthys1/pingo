// Pingo privacy camera: "is it only me in front of the screen?"
//
//   YuNet  (face_detection_yunet_2023mar.onnx, MIT)   finds faces + 5 landmarks
//   SFace  (face_recognition_sface_2021dec.onnx, Apache-2.0)  128-d face embedding
//
// Both run on the CPU through onnxruntime-node. Frames come in as RGBA pixels
// from the renderer's webcam capture and are never written to disk; only the
// owner's embeddings are kept (encrypted by main.js).

const ort = require('onnxruntime-node');
const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, 'models');
const DET_SIZE = 640;        // YuNet model has a fixed 640x640 input
const DET_SCORE = 0.8;       // minimum face confidence
const DET_NMS_IOU = 0.3;
const MIN_FACE_PX = 24;      // ignore specks; anything larger counts as a person
const DEFAULT_MATCH = 0.4;   // cosine similarity needed to count as the owner

// SFace / ArcFace reference landmark positions in the 112x112 aligned crop
const REF_LANDMARKS = [
  [38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041],
];

let sessions = null;

async function load() {
  if (!sessions) {
    // Model bytes are read through fs so this also works from inside app.asar.
    const opts = { logSeverityLevel: 3 };
    sessions = Promise.all([
      ort.InferenceSession.create(fs.readFileSync(path.join(MODEL_DIR, 'face_detection_yunet_2023mar.onnx')), opts),
      ort.InferenceSession.create(fs.readFileSync(path.join(MODEL_DIR, 'face_recognition_sface_2021dec.onnx')), opts),
    ]).then(([det, rec]) => ({ det, rec }));
  }
  return sessions;
}

// ---------------------------------------------------------------- detection

// frame = { data: Uint8Array RGBA, width, height }
async function detect(frame) {
  const { det } = await load();
  const { data, width, height } = frame;
  const scale = Math.min(DET_SIZE / width, DET_SIZE / height);
  const sw = Math.round(width * scale), sh = Math.round(height * scale);

  // BGR planes, 0..255, image in the top-left corner and zero padding elsewhere
  const plane = DET_SIZE * DET_SIZE;
  const input = new Float32Array(3 * plane);
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const s = (sy * width + sx) * 4, d = y * DET_SIZE + x;
      input[d] = data[s + 2];
      input[plane + d] = data[s + 1];
      input[2 * plane + d] = data[s];
    }
  }

  const out = await det.run({ input: new ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]) });
  const faces = [];
  for (const stride of [8, 16, 32]) {
    const cols = DET_SIZE / stride;
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data;
    const box = out[`bbox_${stride}`].data, kps = out[`kps_${stride}`].data;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
      if (score < DET_SCORE) continue;
      const r = Math.floor(i / cols), c = i % cols;
      const cx = (c + box[i * 4]) * stride, cy = (r + box[i * 4 + 1]) * stride;
      const w = Math.exp(box[i * 4 + 2]) * stride, h = Math.exp(box[i * 4 + 3]) * stride;
      const landmarks = [];
      for (let n = 0; n < 5; n++)
        landmarks.push([((kps[i * 10 + 2 * n] + c) * stride) / scale, ((kps[i * 10 + 2 * n + 1] + r) * stride) / scale]);
      faces.push({ score, box: [(cx - w / 2) / scale, (cy - h / 2) / scale, w / scale, h / scale], landmarks });
    }
  }
  return nms(faces).filter((f) => f.box[2] >= MIN_FACE_PX);
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]), y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a[2] * a[3] + b[2] * b[3] - inter || 1);
}

function nms(faces) {
  faces.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const f of faces) if (kept.every((k) => iou(k.box, f.box) < DET_NMS_IOU)) kept.push(f);
  return kept;
}

// ---------------------------------------------------------------- recognition

// Least-squares similarity transform (rotation + uniform scale + shift) that
// maps the detected landmarks onto the reference landmarks.
function similarityTransform(src, dst) {
  const n = src.length;
  let msx = 0, msy = 0, mdx = 0, mdy = 0;
  for (let i = 0; i < n; i++) { msx += src[i][0]; msy += src[i][1]; mdx += dst[i][0]; mdy += dst[i][1]; }
  msx /= n; msy /= n; mdx /= n; mdy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - msx, sy = src[i][1] - msy, dx = dst[i][0] - mdx, dy = dst[i][1] - mdy;
    num1 += sx * dx + sy * dy;
    num2 += sx * dy - sy * dx;
    den += sx * sx + sy * sy;
  }
  const a = num1 / den, b = num2 / den;
  return { a, b, tx: mdx - (a * msx - b * msy), ty: mdy - (b * msx + a * msy) };
}

// 112x112 aligned face -> RGB planes (SFace expects RGB, 0..255)
function alignCrop(frame, landmarks) {
  const { data, width, height } = frame;
  const { a, b, tx, ty } = similarityTransform(landmarks, REF_LANDMARKS);
  const det = a * a + b * b;
  const plane = 112 * 112;
  const out = new Float32Array(3 * plane);
  for (let v = 0; v < 112; v++)
    for (let u = 0; u < 112; u++) {
      // inverse transform: crop pixel -> source pixel
      const px = u - tx, py = v - ty;
      const x = (a * px + b * py) / det, y = (-b * px + a * py) / det;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const d = v * 112 + u;
      for (let ch = 0; ch < 3; ch++) {
        const p = (xx, yy) => (xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : data[(yy * width + xx) * 4 + ch]);
        out[ch * plane + d] =
          p(x0, y0) * (1 - fx) * (1 - fy) + p(x0 + 1, y0) * fx * (1 - fy) +
          p(x0, y0 + 1) * (1 - fx) * fy + p(x0 + 1, y0 + 1) * fx * fy;
      }
    }
  return out;
}

async function embed(frame, landmarks) {
  const { rec } = await load();
  const out = await rec.run({ data: new ort.Tensor('float32', alignCrop(frame, landmarks), [1, 3, 112, 112]) });
  const v = Float32Array.from(out.fc1.data);
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// How much a face looks like the owner: mean of the 3 best matches against the
// enrolled embeddings (more robust than a single best match).
function ownerSimilarity(embedding, profile) {
  if (!profile || !profile.length) return 0;
  const sims = profile.map((p) => dot(embedding, p)).sort((x, y) => y - x);
  const top = sims.slice(0, Math.min(3, sims.length));
  return top.reduce((s, x) => s + x, 0) / top.length;
}

// ---------------------------------------------------------------- decisions

// Looks at a few frames and decides what Pingo may show.
//   owner    - only you are there          -> show the message
//   others   - you + somebody else          -> hide the text
//   stranger - somebody, but not you        -> hide the text
//   nobody   - no face at all               -> hide the text
async function checkPresence(frames, profile, threshold = DEFAULT_MATCH) {
  let ownerAlone = 0, withOthers = 0, strangers = 0, empty = 0, best = 0, maxFaces = 0;
  for (const frame of frames) {
    const faces = await detect(frame);
    maxFaces = Math.max(maxFaces, faces.length);
    if (!faces.length) { empty++; continue; }
    let mine = 0;
    for (const f of faces) {
      const sim = ownerSimilarity(await embed(frame, f.landmarks), profile);
      best = Math.max(best, sim);
      if (sim >= threshold) mine++;
    }
    if (mine && faces.length > mine) withOthers++;
    else if (mine) ownerAlone++;
    else strangers++;
  }
  let verdict = 'nobody';
  if (withOthers) verdict = 'others';                       // any glimpse of a second face hides it
  else if (ownerAlone * 2 >= frames.length && ownerAlone) verdict = 'owner';
  else if (strangers) verdict = 'stranger';
  return { verdict, bestSimilarity: +best.toFixed(3), maxFaces, frames: frames.length, ownerAlone, empty };
}

module.exports = { load, detect, embed, ownerSimilarity, checkPresence, DEFAULT_MATCH };
