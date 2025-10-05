let userActivity = {
  typing: false,
  scrolling: false,
  clicking: false,
  lastActivity: Date.now()
};

let activityTimer;

function trackUserActivity() {
  userActivity.lastActivity = Date.now();
  
  if (activityTimer) {
    clearTimeout(activityTimer);
  }

  activityTimer = setTimeout(() => {
    chrome.runtime.sendMessage({
      action: 'userInactive',
      data: userActivity
    });
  }, 30000);
}

document.addEventListener('keydown', () => {
  userActivity.typing = true;
  trackUserActivity();
});

document.addEventListener('keyup', () => {
  userActivity.typing = false;
});

document.addEventListener('scroll', () => {
  userActivity.scrolling = true;
  trackUserActivity();
  
  setTimeout(() => {
    userActivity.scrolling = false;
  }, 1000);
});

document.addEventListener('click', () => {
  userActivity.clicking = true;
  trackUserActivity();
  
  setTimeout(() => {
    userActivity.clicking = false;
  }, 500);
});

document.addEventListener('mousemove', () => {
  trackUserActivity();
});

setInterval(() => {
  chrome.runtime.sendMessage({
    action: 'activityHeartbeat',
    data: {
      ...userActivity,
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    }
  });
}, 10000);