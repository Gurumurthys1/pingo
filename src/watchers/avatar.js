// Turns the profile-picture link found in a chat app's toast into a small
// data: URL the overlay can show. Only WhatsApp/Telegram image servers and
// files inside the apps' own package folders are accepted, and the bytes must
// really be an image (checked by magic number, not by what the server says).

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const HOSTS = /(^|\.)(whatsapp\.net|fbcdn\.net|telegram\.org|cdn-telegram\.org)$/i;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 4000;
const CACHE_SIZE = 64;

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// fetchImpl: Electron's net.fetch (uses the system proxy/certs)
// allowedDirs: folders local avatar files may come from
function createAvatarResolver({ fetchImpl, allowedDirs }) {
  const cache = new Map();
  const roots = allowedDirs.filter(Boolean).map((d) => path.resolve(d).toLowerCase() + path.sep);

  async function load(src) {
    if (/^https:\/\//i.test(src)) {
      if (!HOSTS.test(new URL(src).hostname)) return null;
      const res = await withTimeout(fetchImpl(src, { redirect: 'follow' }), TIMEOUT_MS);
      if (!res.ok || !HOSTS.test(new URL(res.url || src).hostname)) return null;
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return null;
      return Buffer.from(await withTimeout(res.arrayBuffer(), TIMEOUT_MS));
    }
    const file = /^file:/i.test(src) ? fileURLToPath(src) : src;
    if (!path.isAbsolute(file)) return null;
    const real = fs.realpathSync(file);
    if (!roots.some((r) => real.toLowerCase().startsWith(r))) return null;
    if (fs.statSync(real).size > MAX_BYTES) return null;
    return fs.readFileSync(real);
  }

  return async function resolve(src) {
    if (!src || typeof src !== 'string' || src.length > 2048) return null;
    if (cache.has(src)) return cache.get(src);
    let url = null;
    try {
      const buf = await load(src);
      const type = buf && buf.length <= MAX_BYTES && sniff(buf);
      if (type) url = `data:${type};base64,${buf.toString('base64')}`;
    } catch {
      url = null; // offline, expired link, missing file: just fall back to initials
    }
    cache.set(src, url);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    return url;
  };
}

module.exports = { createAvatarResolver, sniff };
