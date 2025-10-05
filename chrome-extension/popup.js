class PopupController {
  constructor() {
    this.initializeElements();
    this.initializePopup();
    this.setupEventListeners();
  }

  initializeElements() {
    // Authentication elements
    this.loginForm = document.getElementById('loginForm');
    this.activityStatus = document.getElementById('activityStatus');
    this.loginButton = document.getElementById('loginButton');
    this.logoutButton = document.getElementById('logout');
    this.viewDashboardButton = document.getElementById('viewDashboard');
    this.loginError = document.getElementById('loginError');

    // Activity tracking elements
    this.syncBtn = document.getElementById('syncBtn');
    this.status = document.getElementById('status');
    this.todayActivities = document.getElementById('todayActivities');
    this.todayTime = document.getElementById('todayTime');
  }

  setupEventListeners() {
    const toggleAuth = document.getElementById('toggleAuth');
    const registerFields = document.getElementById('registerFields');
    let isLogin = true;

    toggleAuth.addEventListener('click', () => {
      isLogin = !isLogin;
      registerFields.style.display = isLogin ? 'none' : 'block';
      this.loginButton.textContent = isLogin ? 'Login' : 'Create Account';
      toggleAuth.textContent = isLogin ? 'Create Account' : 'Back to Login';
      this.loginError.textContent = '';
    });

    this.loginButton.addEventListener('click', () => {
      if (isLogin) {
        this.handleLogin();
      } else {
        this.handleRegister();
      }
    });
    
    this.logoutButton.addEventListener('click', () => this.handleLogout());
    this.viewDashboardButton.addEventListener('click', () => this.openDashboard());
    this.syncBtn.addEventListener('click', () => this.handleSync());
  }

  async initializePopup() {
    try {
      const token = await this.getStoredToken();
      if (token) {
        this.loginForm.style.display = 'none';
        this.activityStatus.style.display = 'block';
        await this.loadStats();
      } else {
        this.loginForm.style.display = 'block';
        this.activityStatus.style.display = 'none';
      }
    } catch (error) {
      console.error('Error initializing popup:', error);
      this.setStatus('Error loading data', 'error');
    }
  }

  async getStoredToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['accessToken'], (result) => {
        resolve(result.accessToken);
      });
    });
  }

  async getStoredActivities() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['activities'], (result) => {
        resolve(result.activities || []);
      });
    });
  }

  async handleRegister() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name')?.value;

    try {
      const response = await fetch('http://localhost:3001/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        chrome.storage.local.set({ accessToken: data.token }, () => {
          this.loginForm.style.display = 'none';
          this.activityStatus.style.display = 'block';
          this.loginError.textContent = '';
          this.loadStats();
        });
      } else {
        this.loginError.textContent = data.error || 'Registration failed';
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.loginError.textContent = 'Registration failed. Please try again.';
    }
  }

  async handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.token) {
        chrome.storage.local.set({ accessToken: data.token }, () => {
          this.loginForm.style.display = 'none';
          this.activityStatus.style.display = 'block';
          this.loginError.textContent = '';
          this.loadStats();
        });
      } else {
        this.loginError.textContent = data.message || 'Login failed. Please check your credentials.';
      }
    } catch (error) {
      console.error('Login error:', error);
      this.loginError.textContent = 'Login failed. Please try again.';
    }
  }

  async handleLogout() {
    chrome.storage.local.clear(() => {
      this.loginForm.style.display = 'block';
      this.activityStatus.style.display = 'none';
      this.setStatus('Logged out successfully', 'info');
    });
  }

  openDashboard() {
    chrome.tabs.create({ url: 'http://localhost:3000/timeline' });
  }

  async handleSync() {
    try {
      const token = await this.getStoredToken();
      if (!token) {
        this.setStatus('Please login first', 'error');
        return;
      }

      this.setStatus('Syncing...', 'info');
      this.syncBtn.disabled = true;

      const activities = await this.getStoredActivities();
      const response = await fetch('http://localhost:3000/api/activities/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ activities }),
      });

      if (response.ok) {
        const now = new Date().toLocaleString();
        chrome.storage.local.set({ lastSync: now });
        this.setStatus('Sync completed successfully', 'success');
        await this.loadStats();
      } else {
        throw new Error('Failed to sync activities');
      }
    } catch (error) {
      console.error('Sync error:', error);
      this.setStatus('Sync failed: ' + error.message, 'error');
    } finally {
      this.syncBtn.disabled = false;
    }
  }

  async loadStats() {
    try {
      const activities = await this.getStoredActivities();
      const today = new Date().toDateString();
      const todayActivities = activities.filter(a => 
        new Date(a.timestamp).toDateString() === today
      );

      this.todayActivities.textContent = todayActivities.length.toString();
      const totalMinutes = todayActivities.reduce((acc, curr) => acc + (curr.duration || 0), 0);
      this.todayTime.textContent = `${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m`;

      this.setStatus('Stats updated', 'success');
    } catch (error) {
      console.error('Error loading stats:', error);
      this.setStatus('Error loading stats', 'error');
    }
  }

  setStatus(message, type = 'info') {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
    
    if (type === 'success') {
      setTimeout(() => {
        this.status.textContent = '';
        this.status.className = 'status';
      }, 3000);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
});