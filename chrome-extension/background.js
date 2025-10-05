class ActivityTracker {
  constructor() {
    this.currentActivity = null;
    this.activityStartTime = null;
    this.isActive = true;
    this.lastSync = null;
    this.syncRetries = 0;
    this.maxRetries = 3;
    this.apiUrl = 'http://localhost:3001/api';
    
    this.initializeTracker();
    this.setupEventListeners();
    this.startPeriodicSync();
  }

  async initializeTracker() {
    try {
      const result = await chrome.storage.local.get(['lastSync', 'pendingActivities']);
      this.lastSync = result.lastSync || null;
      
      if (!result.pendingActivities) {
        await chrome.storage.local.set({ pendingActivities: [] });
      }

      this.startIdleDetection();
      console.log('Rewindly Activity Tracker initialized');
    } catch (error) {
      console.error('Failed to initialize tracker:', error);
    }
  }

  setupEventListeners() {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        this.handleTabChange(tabId);
      }
    });

    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.handleWindowBlur();
      } else {
        this.handleWindowFocus();
      }
    });

    chrome.idle.onStateChanged.addListener((newState) => {
      this.handleIdleStateChange(newState);
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
  }

  async handleTabChange(tabId) {
    try {
      if (this.currentActivity) {
        await this.endCurrentActivity();
      }

      const tab = await chrome.tabs.get(tabId);
      if (tab && tab.url && !tab.url.startsWith('chrome://')) {
        await this.startNewActivity(tab);
      }
    } catch (error) {
      console.error('Error handling tab change:', error);
    }
  }

  async startNewActivity(tab) {
    try {
      const favicon = await this.extractFavicon(tab);
      const description = await this.extractPageDescription(tab);

      this.currentActivity = {
        title: tab.title || 'Unknown Page',
        url: tab.url,
        favicon: favicon,
        description: description,
        timestamp_start: new Date().toISOString(),
        activity_type: 'website'
      };

      this.activityStartTime = Date.now();
      console.log('Started tracking activity:', this.currentActivity.title);
    } catch (error) {
      console.error('Error starting new activity:', error);
    }
  }

  async endCurrentActivity() {
    if (!this.currentActivity || !this.activityStartTime) return;

    try {
      const endTime = Date.now();
      const timeSpent = Math.round((endTime - this.activityStartTime) / 1000);

      if (timeSpent < 5) {
        this.currentActivity = null;
        this.activityStartTime = null;
        return;
      }

      const completedActivity = {
        ...this.currentActivity,
        timestamp_end: new Date().toISOString(),
        time_spent: timeSpent
      };

      await this.saveActivityLocally(completedActivity);
      console.log('Ended activity:', completedActivity.title, `(${timeSpent}s)`);

      this.currentActivity = null;
      this.activityStartTime = null;
    } catch (error) {
      console.error('Error ending activity:', error);
    }
  }

  async extractFavicon(tab) {
    try {
      if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
        return tab.favIconUrl;
      }

      const domain = new URL(tab.url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch (error) {
      return null;
    }
  }

  async extractPageDescription(tab) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: () => {
          const metaDescription = document.querySelector('meta[name="description"]');
          const ogDescription = document.querySelector('meta[property="og:description"]');
          const firstParagraph = document.querySelector('p');
          
          return metaDescription?.content || 
                 ogDescription?.content || 
                 firstParagraph?.textContent?.substring(0, 200) || 
                 document.title;
        }
      });

      return results[0]?.result || null;
    } catch (error) {
      return null;
    }
  }

  async saveActivityLocally(activity) {
    try {
      const result = await chrome.storage.local.get(['pendingActivities']);
      const pendingActivities = result.pendingActivities || [];
      
      pendingActivities.push(activity);
      
      await chrome.storage.local.set({ pendingActivities });
      console.log('Activity saved locally, pending sync');
    } catch (error) {
      console.error('Error saving activity locally:', error);
    }
  }

  async syncActivitiesToServer() {
    try {
      const result = await chrome.storage.local.get(['pendingActivities']);
      const pendingActivities = result.pendingActivities || [];

      if (pendingActivities.length === 0) {
        console.log('No pending activities to sync');
        return { success: true, synced: 0 };
      }

      console.log(`Syncing ${pendingActivities.length} activities to server...`);

      const response = await fetch(`${this.apiUrl}/logActivity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ activities: pendingActivities })
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const data = await response.json();
      
      await chrome.storage.local.set({ 
        pendingActivities: [],
        lastSync: new Date().toISOString()
      });

      this.lastSync = new Date().toISOString();
      this.syncRetries = 0;

      console.log(`Successfully synced ${data.processed} activities`);
      return { success: true, synced: data.processed };

    } catch (error) {
      console.error('Sync failed:', error);
      this.syncRetries++;
      
      if (this.syncRetries < this.maxRetries) {
        setTimeout(() => this.syncActivitiesToServer(), 30000 * this.syncRetries);
      }
      
      return { success: false, error: error.message };
    }
  }

  startPeriodicSync() {
    chrome.alarms.create('periodicSync', { 
      delayInMinutes: 5,
      periodInMinutes: 5 
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'periodicSync') {
        this.syncActivitiesToServer();
      }
    });
  }

  startIdleDetection() {
    chrome.idle.setDetectionInterval(30);
  }

  handleIdleStateChange(newState) {
    console.log('Idle state changed to:', newState);
    
    if (newState === 'idle' || newState === 'locked') {
      this.isActive = false;
      if (this.currentActivity) {
        this.endCurrentActivity();
      }
    } else if (newState === 'active') {
      this.isActive = true;
    }
  }

  handleWindowBlur() {
    this.isActive = false;
    if (this.currentActivity) {
      this.endCurrentActivity();
    }
  }

  async handleWindowFocus() {
    this.isActive = true;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url && !activeTab.url.startsWith('chrome://')) {
        await this.startNewActivity(activeTab);
      }
    } catch (error) {
      console.error('Error handling window focus:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'syncNow':
          const syncResult = await this.syncActivitiesToServer();
          sendResponse(syncResult);
          break;

        case 'getStats':
          const stats = await this.getLocalStats();
          sendResponse(stats);
          break;

        case 'clearData':
          await this.clearLocalData();
          sendResponse({ success: true });
          break;

        case 'getRecentActivities':
          const activities = await this.getRecentActivities(5);
          sendResponse({ activities });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  }

  async getLocalStats() {
    try {
      const result = await chrome.storage.local.get(['pendingActivities', 'lastSync']);
      const pendingActivities = result.pendingActivities || [];
      
      const todayActivities = pendingActivities.filter(activity => {
        const activityDate = new Date(activity.timestamp_start).toDateString();
        const today = new Date().toDateString();
        return activityDate === today;
      });

      const totalTime = todayActivities.reduce((sum, activity) => 
        sum + (activity.time_spent || 0), 0
      );

      return {
        totalActivitiesToday: todayActivities.length,
        totalTimeToday: Math.round(totalTime / 60),
        pendingSync: pendingActivities.length,
        lastSync: result.lastSync
      };
    } catch (error) {
      console.error('Error getting local stats:', error);
      return { error: error.message };
    }
  }

  async getRecentActivities(limit = 5) {
    try {
      const result = await chrome.storage.local.get(['pendingActivities']);
      const pendingActivities = result.pendingActivities || [];
      
      return pendingActivities
        .slice(-limit)
        .reverse()
        .map(activity => ({
          title: activity.title,
          url: activity.url,
          timeSpent: Math.round(activity.time_spent / 60),
          timestamp: new Date(activity.timestamp_start).toLocaleTimeString()
        }));
    } catch (error) {
      console.error('Error getting recent activities:', error);
      return [];
    }
  }

  async clearLocalData() {
    try {
      await chrome.storage.local.clear();
      console.log('Local data cleared');
    } catch (error) {
      console.error('Error clearing local data:', error);
      throw error;
    }
  }
}

const tracker = new ActivityTracker();