// Video Capture Helper - Background Service Worker v3
// Pure recording mode

let recordingTabId = null;
let offscreenReady = false;

// ==================== Offscreen Document ====================

async function ensureOffscreenDocument() {
  if (offscreenReady) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording tab audio and video'
    });
  } catch {
    // Already exists
  }
  offscreenReady = true;
}

async function sendToOffscreen(message) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

// ==================== Keyboard Shortcut ====================

if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-recording') {
      if (recordingTabId !== null) {
        await stopTabRecording();
      } else {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) await startTabRecording(tab.id, {});
      }
    }
  });
}

// ==================== Recording ====================

async function startTabRecording(tabId, options) {
  if (recordingTabId !== null) throw new Error('Already recording');

  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(id);
    });
  });

  const res = await sendToOffscreen({ type: 'start-recording', streamId, options });
  if (!res || !res.success) throw new Error(res?.error || 'Offscreen failed');
  recordingTabId = tabId;
}

async function stopTabRecording() {
  try { await sendToOffscreen({ type: 'stop-recording' }); } catch {}
  recordingTabId = null;
}

async function pauseTabRecording() {
  await sendToOffscreen({ type: 'pause-recording' });
}

async function resumeTabRecording() {
  await sendToOffscreen({ type: 'resume-recording' });
}

// ==================== Message Handler ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Skip messages meant for offscreen (prevent echo loop)
  if (message.target === 'offscreen') return false;

  // Skip messages from offscreen reporting events
  if (message.type === 'recording-complete' || message.type === 'recording-error') {
    recordingTabId = null;
    return false;
  }

  switch (message.type) {
    case 'start-tab-recording':
      startTabRecording(message.tabId, message.options)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'stop-tab-recording':
      stopTabRecording()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'pause-tab-recording':
      pauseTabRecording()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'resume-tab-recording':
      resumeTabRecording()
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'get-recording-state':
      sendToOffscreen({ type: 'get-recording-state' })
        .then(state => sendResponse({ ...(state || {}), tabId: recordingTabId }))
        .catch(() => sendResponse({ isRecording: false, isPaused: false, tabId: null }));
      return true;
  }
  return false;
});
