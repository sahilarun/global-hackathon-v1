let accessToken = '';
let refreshToken = '';
let userId = '';

// Function to handle authentication
async function authenticate(email, password) {
  try {
    const response = await fetch('http://localhost:3001/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    const data = await response.json();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    userId = data.user.id;

    // Store tokens
    chrome.storage.local.set({
      accessToken,
      refreshToken,
      userId,
      userEmail: email,
    });

    return true;
  } catch (error) {
    console.error('Authentication error:', error);
    return false;
  }
}

// Function to refresh the token
async function refreshAccessToken() {
  try {
    const response = await fetch('http://localhost:3001/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;

    // Update stored tokens
    chrome.storage.local.set({ accessToken, refreshToken });

    return true;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

// Function to send activity data
async function sendActivityData(activities) {
  try {
    const response = await fetch('http://localhost:3001/api/logActivity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ activities }),
    });

    if (response.status === 401) {
      // Token expired, try to refresh
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry with new token
        return sendActivityData(activities);
      } else {
        throw new Error('Authentication expired');
      }
    }

    if (!response.ok) {
      throw new Error('Failed to send activity data');
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending activity data:', error);
    throw error;
  }
}

// Initialize authentication state
chrome.storage.local.get(['accessToken', 'refreshToken', 'userId', 'userEmail'], (result) => {
  if (result.accessToken && result.refreshToken) {
    accessToken = result.accessToken;
    refreshToken = result.refreshToken;
    userId = result.userId;
  }
});

// Export functions for use in other extension files
window.extensionAuth = {
  authenticate,
  refreshAccessToken,
  sendActivityData,
  isAuthenticated: () => !!accessToken,
};