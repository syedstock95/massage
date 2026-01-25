// API Configuration
const CONFIG = {
    // API Base URL - Auto-detect based on environment
    API_URL: (() => {
        const hostname = window.location.hostname;
        // Production: Railway or custom domain
        if (hostname.includes('aiappspro.com')) {
            return 'https://api-massage.aiappspro.com/api';
        }
        if (hostname.includes('railway.app')) {
            // Extract the project name from frontend URL and construct API URL
            return hostname.replace('massage-frontend', 'massage-api').replace(/^/, 'https://') + '/api';
        }
        // Local development
        return 'http://localhost:3001/api';
    })(),
    
    // App Info
    APP_NAME: 'MassageNearMe',
    APP_VERSION: '1.0.0',
    
    // Default search settings
    DEFAULT_RADIUS: 25,
    DEFAULT_LIMIT: 20,
    
    // Local storage keys
    STORAGE_KEYS: {
        TOKEN: 'massage_auth_token',
        USER: 'massage_user',
        SEARCH_HISTORY: 'massage_search_history',
        RECENT_ZIP: 'massage_recent_zip'
    }
};

// Helper to get auth token
function getAuthToken() {
    return localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
}

// Helper to set auth token
function setAuthToken(token) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, token);
}

// Helper to remove auth token
function removeAuthToken() {
    localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
    localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
}

// Helper to get current user
function getCurrentUser() {
    const userStr = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
}

// Helper to set current user
function setCurrentUser(user) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(user));
}

// API helper with auth
async function apiRequest(endpoint, options = {}) {
    const url = `${CONFIG.API_URL}${endpoint}`;
    const token = getAuthToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    try {
        const response = await fetch(url, {
            ...options,
            headers
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0
    }).format(amount);
}

// Format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
