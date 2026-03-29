// Video Capture Helper - Content Script
// Detects <video> elements on the page

(() => {
  'use strict';

  function detectVideos() {
    const videos = document.querySelectorAll('video');
    const result = [];
    videos.forEach((video, index) => {
      result.push({
        index,
        width: video.videoWidth || video.clientWidth,
        height: video.videoHeight || video.clientHeight,
        duration: video.duration || 0,
        currentTime: video.currentTime || 0,
        paused: video.paused,
        src: video.src || video.currentSrc || ''
      });
    });
    return result;
  }

  // Watch for dynamically added video elements
  const observer = new MutationObserver((mutations) => {
    let hasNewVideo = false;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
          hasNewVideo = true;
          break;
        }
      }
      if (hasNewVideo) break;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Only respond to detectVideos - return false for everything else
  // so we don't block the message channel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'detectVideos') {
      sendResponse({ videos: detectVideos() });
      return true; // keep channel open for this response
    }
    return false; // do NOT keep channel open for other messages
  });
})();
