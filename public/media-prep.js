(() => {
  const uploadLimit = 4 * 1024 * 1024;

  async function preparePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const photo = new Image();
      photo.src = url;
      try {
        await photo.decode();
      } catch {
        throw new Error('This browser could not open the photo. Try a JPG, PNG or WebP copy.');
      }
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      for (const edge of [2400, 1800, 1200, 800]) {
        const scale = Math.min(1, edge / Math.max(photo.naturalWidth, photo.naturalHeight));
        canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
        context.drawImage(photo, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.84));
        if (blob && blob.size <= uploadLimit) return blob;
      }
      throw new Error('This photo could not be compressed for upload.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function uploadMedia(blob, signal) {
    const response = await fetch('/.netlify/functions/media', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { ...authHeaders(), 'content-type': blob.type },
      body: blob,
      signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !/^\/\.netlify\/functions\/media\?id=[a-f0-9]{64}$/.test(data.url || '')) {
      throw new Error(data.error || 'Upload failed. Please try again.');
    }
    return data.url;
  }

  async function prepareCoverVideo(file, signal) {
    if (['video/mp4', 'video/webm'].includes(file.type) && file.size <= uploadLimit) return file;
    const mime = ['video/webm;codecs=vp8', 'video/mp4'].find(type => window.MediaRecorder?.isTypeSupported(type));
    const canvas = document.createElement('canvas');
    if (!mime || !canvas.captureStream) throw new Error('Try Chrome or Edge to compress this clip, or paste a hosted MP4/WebM link.');
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let stream, recorder, timer;
    try {
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error('This browser cannot open the video. Try an MP4 copy.'));
        timer = setTimeout(() => reject(new Error('The clip took too long to open. Try an MP4 copy.')), 15000);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        video.src = url;
      });
      clearTimeout(timer);
      if (!Number.isFinite(video.duration) || video.duration > 60 || !video.videoWidth) {
        throw new Error('Choose a cover clip up to 60 seconds, or paste a hosted MP4/WebM link.');
      }
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
      canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
      const context = canvas.getContext('2d');
      const draw = () => context.drawImage(video, 0, 0, canvas.width, canvas.height);
      draw();
      stream = canvas.captureStream(24);
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: Math.min(1800000, Math.floor(24000000 / Math.max(1, video.duration)))
      });
      const blob = await new Promise((resolve, reject) => {
        const chunks = [];
        const stop = () => { if (recorder.state !== 'inactive') recorder.stop(); };
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }));
        recorder.onerror = () => reject(new Error('Video compression failed. Try a shorter clip or a hosted link.'));
        video.onended = stop;
        video.onerror = () => reject(new Error('The clip could not be decoded.'));
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        recorder.start(250);
        const frames = setInterval(draw, 1000 / 24);
        const timeout = setTimeout(() => reject(new Error('Video compression timed out. Keep this tab open or use a hosted link.')), (video.duration + 20) * 1000);
        recorder.addEventListener('stop', () => { clearInterval(frames); clearTimeout(timeout); }, { once: true });
        video.play().catch(reject);
      });
      if (!blob.size || blob.size > uploadLimit) {
        throw new Error('The compressed clip is still too large. Try a shorter clip or paste a hosted MP4/WebM link.');
      }
      return blob;
    } finally {
      clearTimeout(timer);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stream?.getTracks().forEach(track => track.stop());
      video.pause();
      URL.revokeObjectURL(url);
    }
  }

  window.mediaPrep = { preparePhoto, uploadMedia, prepareCoverVideo };
})();
