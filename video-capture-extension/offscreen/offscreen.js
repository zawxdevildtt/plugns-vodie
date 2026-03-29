// Video Capture Helper - Offscreen Document v3

let mediaRecorder = null;
let chunks = [];
let startTime = 0;
let pausedDuration = 0;
let pauseStartTime = 0;
let timerInterval = null;
let currentStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return false;

  switch (message.type) {
    case 'start-recording':
      startRecording(message.streamId, message.options || {})
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'stop-recording':
      stopRecording();
      sendResponse({ success: true });
      return false;

    case 'pause-recording':
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseStartTime = Date.now();
      }
      sendResponse({ success: true });
      return false;

    case 'resume-recording':
      if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        pausedDuration += Date.now() - pauseStartTime;
        pauseStartTime = 0;
      }
      sendResponse({ success: true });
      return false;

    case 'get-recording-state': {
      let elapsed = 0;
      if (mediaRecorder) {
        const now = Date.now();
        const cp = mediaRecorder.state === 'paused' ? now - pauseStartTime : 0;
        elapsed = now - startTime - pausedDuration - cp;
      }
      sendResponse({
        isRecording: !!mediaRecorder,
        isPaused: mediaRecorder?.state === 'paused',
        elapsed
      });
      return false;
    }
  }
  return false;
});

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.target !== 'offscreen') return;
  const port = event.ports?.[0];
  if (!port) return;

  switch (msg.type) {
    case 'start-recording':
      startRecording(msg.streamId, msg.options || {})
        .then(() => port.postMessage({ success: true }))
        .catch(err => port.postMessage({ success: false, error: err.message }));
      break;
    case 'stop-recording':
      stopRecording();
      port.postMessage({ success: true });
      break;
    case 'get-recording-state': {
      let elapsed = 0;
      if (mediaRecorder) {
        const now = Date.now();
        const cp = mediaRecorder.state === 'paused' ? now - pauseStartTime : 0;
        elapsed = now - startTime - pausedDuration - cp;
      }
      port.postMessage({ isRecording: !!mediaRecorder, isPaused: mediaRecorder?.state === 'paused', elapsed });
      break;
    }
  }
});

// ==================== Recording ====================

async function startRecording(streamId, options) {
  if (mediaRecorder) throw new Error('Already recording');

  // Get tab stream (audio + video)
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  // Use AudioContext to split audio for both playback and recording
  // This is the most reliable way to ensure audio reaches both destinations
  const audioCtx = new AudioContext();
  const audioSource = audioCtx.createMediaStreamSource(tabStream);
  const audioDest = audioCtx.createMediaStreamDestination();

  // Route audio to speakers (so user hears during recording)
  audioSource.connect(audioCtx.destination);
  // Route audio to recording destination
  audioSource.connect(audioDest);

  // Build the recording stream: audio from AudioContext + video from tabStream
  const recordingStream = new MediaStream([
    ...audioDest.stream.getAudioTracks(),
    ...tabStream.getVideoTracks()
  ]);

  currentStream = tabStream;
  currentStream._audioCtx = audioCtx;
  currentStream._audioSource = audioSource;

  // Codec selection based on user's format preference
  const format = options.format || 'webm';
  let mimeType = '';
  let ext = 'webm';

  // Codec lists for each container format
  // Always use WebM codecs internally (proven to work with AudioContext + opus)
  // The file extension matches user's selection
  const codecMap = {
    mp4: [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ],
    avi: [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ],
    mov: [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ],
    webm: [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm'
    ]
  };

  // Try requested format first, then fall back to webm
  const tryOrder = [format, 'webm'];  for (const f of tryOrder) {
    const codecs = codecMap[f];
    if (!codecs) continue;
    for (const c of codecs) {
      if (MediaRecorder.isTypeSupported(c)) { mimeType = c; ext = f; break; }
    }
    if (mimeType) break;
  }

  if (!mimeType) {
    tabStream.getTracks().forEach(t => t.stop());
    audioCtx.close();
    throw new Error('No supported codec');
  }

  const bitrate = options.bitrate || 8000000;
  chunks = [];
  pausedDuration = 0;

  mediaRecorder = new MediaRecorder(recordingStream, {
    mimeType,
    videoBitsPerSecond: bitrate
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    // Cleanup audio
    if (tabStream._audioSource) { tabStream._audioSource.disconnect(); }
    if (tabStream._audioCtx) { tabStream._audioCtx.close().catch(() => {}); }

    // Map extension to MIME type for Blob
    const mimeMap = { mp4: 'video/mp4', avi: 'video/x-msvideo', mov: 'video/quicktime', webm: 'video/webm' };
    const containerType = mimeMap[ext] || 'video/webm';
    const blob = new Blob(chunks, { type: containerType });
    const url = URL.createObjectURL(blob);
    const filename = `video-recording-${ts(new Date())}.${ext}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 10000);

    chrome.runtime.sendMessage({ type: 'recording-complete', filename }).catch(() => {});

    tabStream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
    currentStream = null;
    chunks = [];
    clearInterval(timerInterval);
    timerInterval = null;
  };

  mediaRecorder.onerror = (e) => {
    if (tabStream._audioSource) { tabStream._audioSource.disconnect(); }
    if (tabStream._audioCtx) { tabStream._audioCtx.close().catch(() => {}); }
    tabStream.getTracks().forEach(t => t.stop());
    mediaRecorder = null;
    currentStream = null;
    chunks = [];
    clearInterval(timerInterval);
    timerInterval = null;
    chrome.runtime.sendMessage({
      type: 'recording-error',
      error: e.error?.message || 'Failed'
    }).catch(() => {});
  };

  startTime = Date.now();
  mediaRecorder.start(1000);

  timerInterval = setInterval(() => {
    if (!mediaRecorder) { clearInterval(timerInterval); return; }
    const now = Date.now();
    const cp = mediaRecorder.state === 'paused' ? now - pauseStartTime : 0;
    chrome.runtime.sendMessage({
      type: 'recording-progress',
      elapsed: now - startTime - pausedDuration - cp,
      isPaused: mediaRecorder.state === 'paused'
    }).catch(() => {});
  }, 200);
}

function stopRecording() {
  if (!mediaRecorder) return;
  if (mediaRecorder.state === 'paused') {
    pausedDuration += Date.now() - pauseStartTime;
  }
  clearInterval(timerInterval);
  timerInterval = null;
  if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
    mediaRecorder.stop();
  }
}

function ts(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
