// Video Capture Helper - Popup Script v3

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-start').addEventListener('click', startRecording);
  document.getElementById('btn-pause').addEventListener('click', pauseRecording);
  document.getElementById('btn-resume').addEventListener('click', resumeRecording);
  document.getElementById('btn-stop').addEventListener('click', stopRecording);
  document.getElementById('btn-stop-pause').addEventListener('click', stopRecording);
  document.getElementById('btn-detect').addEventListener('click', detectVideos);
  document.getElementById('sel-format').addEventListener('change', updateFooterTip);

  checkRecordingState();
  detectVideos();
});

// ==================== Helpers ====================

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function updateFooterTip() {
  const tips = {
    auto: '自动模式优先 MP4，不支持时回退 WebM',
    mp4: 'Chrome 121+ 支持直接录制 MP4',
    webm: 'WebM 兼容性最好，可用 ffmpeg 转 MP4'
  };
  document.getElementById('footer-tip').textContent = tips[document.getElementById('sel-format').value] || '';
}

// ==================== UI State ====================

let elapsedTimer = null;
let currentElapsed = 0;

function setUIState(state) {
  const timerCard = document.getElementById('timer-card');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const panels = ['control-row', 'control-recording', 'control-paused'];

  panels.forEach(id => document.getElementById(id).classList.add('hidden'));
  timerCard.classList.remove('recording', 'paused');
  statusDot.className = 'status-dot idle';

  const settings = [document.getElementById('sel-quality'), document.getElementById('sel-format')];

  switch (state) {
    case 'idle':
      document.getElementById('control-row').classList.remove('hidden');
      statusText.textContent = '就绪';
      settings.forEach(s => s.disabled = false);
      break;
    case 'recording':
      document.getElementById('control-recording').classList.remove('hidden');
      timerCard.classList.add('recording');
      statusDot.className = 'status-dot recording';
      statusText.textContent = '录制中';
      settings.forEach(s => s.disabled = true);
      break;
    case 'paused':
      document.getElementById('control-paused').classList.remove('hidden');
      timerCard.classList.add('paused');
      statusDot.className = 'status-dot paused';
      statusText.textContent = '已暂停';
      settings.forEach(s => s.disabled = true);
      break;
  }
}

function startElapsedTimer() {
  stopElapsedTimer();
  elapsedTimer = setInterval(() => {
    currentElapsed += 200;
    document.getElementById('timer-display').textContent = formatElapsed(currentElapsed);
  }, 200);
}

function stopElapsedTimer() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
}

function formatElapsed(ms) {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

// ==================== Recording Actions ====================

async function checkRecordingState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'get-recording-state' });
    if (state.isRecording) {
      currentElapsed = state.elapsed || 0;
      document.getElementById('timer-display').textContent = formatElapsed(currentElapsed);
      if (state.isPaused) {
        setUIState('paused');
      } else {
        setUIState('recording');
        startElapsedTimer();
      }
    }
  } catch {}
}

async function startRecording() {
  const tab = await getActiveTab();
  if (!tab) return;

  const btn = document.getElementById('btn-start');
  btn.disabled = true;

  const options = {
    bitrate: parseInt(document.getElementById('sel-quality').value),
    format: document.getElementById('sel-format').value
  };

  try {
    const res = await chrome.runtime.sendMessage({
      type: 'start-tab-recording', tabId: tab.id, options
    });
    if (res && res.success) {
      currentElapsed = 0;
      setUIState('recording');
      startElapsedTimer();
      showToast('录制已开始');
    } else {
      showToast('失败: ' + (res?.error || '未知错误'));
      btn.disabled = false;
    }
  } catch (err) {
    showToast('失败: ' + (err.message || '连接失败'));
    btn.disabled = false;
  }
}

async function pauseRecording() {
  try {
    await chrome.runtime.sendMessage({ type: 'pause-tab-recording' });
    stopElapsedTimer();
    setUIState('paused');
    showToast('已暂停');
  } catch {}
}

async function resumeRecording() {
  try {
    await chrome.runtime.sendMessage({ type: 'resume-tab-recording' });
    setUIState('recording');
    startElapsedTimer();
    showToast('继续录制');
  } catch {}
}

async function stopRecording() {
  stopElapsedTimer();
  try { await chrome.runtime.sendMessage({ type: 'stop-tab-recording' }); } catch {}
  setUIState('idle');
  document.getElementById('timer-display').textContent = '00:00';
  currentElapsed = 0;
  showToast('录制完成，文件已保存');
}

// ==================== Video Detection ====================

async function detectVideos() {
  const tab = await getActiveTab();
  if (!tab) return;
  const el = document.getElementById('video-list');

  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'detectVideos' });
    if (res.videos && res.videos.length > 0) {
      el.innerHTML = res.videos.map(v => `
        <span class="video-tag">
          <span class="dot ${v.paused ? 'off' : ''}"></span>
          ${v.width}x${v.height}
        </span>
      `).join('');
    } else {
      el.innerHTML = '<span class="no-video">未检测到视频</span>';
    }
  } catch {
    el.innerHTML = '<span class="no-video">刷新页面后重试</span>';
  }
}
