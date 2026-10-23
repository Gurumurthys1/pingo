// Webcam helpers shared by the overlay (quick presence checks) and the control
// panel (face setup). Frames are plain RGBA pixels handed to the main process.

const Camera = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let canvas = null;

  async function open(video, { width = 640, height = 480 } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
      audio: false,
    });
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    return stream;
  }

  function stop(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  // Current video frame as { data: Uint8Array RGBA, width, height }
  function grab(video) {
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) return null;
    canvas = canvas || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, width, height);
    return { data: new Uint8Array(ctx.getImageData(0, 0, width, height).data.buffer), width, height };
  }

  // Open the camera, let auto-exposure settle, take a few frames, close it.
  async function snapshot({ count = 3, gap = 160, warmup = 450 } = {}) {
    const video = document.createElement('video');
    let stream = null;
    try {
      stream = await open(video);
      await sleep(warmup);
      const frames = [];
      for (let i = 0; i < count; i++) {
        const f = grab(video);
        if (f) frames.push(f);
        if (i < count - 1) await sleep(gap);
      }
      return frames;
    } finally {
      stop(stream);
      video.srcObject = null;
    }
  }

  return { open, stop, grab, snapshot };
})();
