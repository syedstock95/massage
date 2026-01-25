// Main App JavaScript
// Common functionality across all pages

document.addEventListener('DOMContentLoaded', () => {
    initMobileMenu();
    initPWAInstall();
    registerServiceWorker();
    checkAuthState();
});

// Mobile Menu
function initMobileMenu() {
    const menuBtn = document.getElementById('mobileMenuBtn');
    const menuOverlay = document.getElementById('mobileMenu');
    const menuClose = document.getElementById('mobileMenuClose');
    
    if (!menuBtn || !menuOverlay) return;
    
    menuBtn.addEventListener('click', () => {
        menuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    const closeMenu = () => {
        menuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    };
    
    if (menuClose) {
        menuClose.addEventListener('click', closeMenu);
    }
    
    menuOverlay.addEventListener('click', (e) => {
        if (e.target === menuOverlay) {
            closeMenu();
        }
    });
}

// PWA Install Prompt
let deferredPrompt;

function initPWAInstall() {
    const installBanner = document.getElementById('installBanner');
    const installBtn = document.getElementById('installBtn');
    const installClose = document.getElementById('installClose');
    
    if (!installBanner) return;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install banner after 3 seconds
        setTimeout(() => {
            installBanner.classList.add('active');
        }, 3000);
    });
    
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            
            console.log(`Install prompt outcome: ${outcome}`);
            deferredPrompt = null;
            installBanner.classList.remove('active');
        });
    }
    
    if (installClose) {
        installClose.addEventListener('click', () => {
            installBanner.classList.remove('active');
        });
    }
    
    // Hide banner if app is already installed
    window.addEventListener('appinstalled', () => {
        installBanner.classList.remove('active');
        deferredPrompt = null;
    });
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('SW registered:', registration.scope);
            } catch (error) {
                console.log('SW registration failed:', error);
            }
        });
    }
}

// Check Auth State and Update UI
function checkAuthState() {
    const user = getCurrentUser();
    const loginLinks = document.querySelectorAll('.nav-link-login, .mobile-nav-link[href="login.html"]');
    
    if (user) {
        loginLinks.forEach(link => {
            if (user.role === 'therapist') {
                link.textContent = 'Dashboard';
                link.href = 'dashboard.html';
            } else {
                link.textContent = 'My Account';
                link.href = 'account.html';
            }
        });
    }
}

// Generate Star Rating HTML
function generateStarRating(rating, count = null) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    
    let html = '<div class="rating-stars">';
    
    for (let i = 0; i < fullStars; i++) {
        html += '<span class="material-icons-round">star</span>';
    }
    
    if (hasHalf) {
        html += '<span class="material-icons-round">star_half</span>';
    }
    
    for (let i = 0; i < emptyStars; i++) {
        html += '<span class="material-icons-round empty">star_border</span>';
    }
    
    html += '</div>';
    
    if (count !== null) {
        html += `<span class="rating-text">${rating.toFixed(1)} (${count} reviews)</span>`;
    }
    
    return html;
}

// Show Toast Notification
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="material-icons-round">${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}</span>
        <span>${message}</span>
    `;
    
    // Add toast styles if not present
    if (!document.querySelector('#toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            .toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--bg-dark);
                color: white;
                padding: 16px 24px;
                border-radius: var(--radius-md);
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: var(--font-base);
                box-shadow: var(--shadow-xl);
                z-index: 3000;
                animation: slideUp 0.3s ease;
            }
            .toast-success { background: var(--success); }
            .toast-error { background: var(--error); }
            @keyframes slideUp {
                from { transform: translate(-50%, 100%); opacity: 0; }
                to { transform: translate(-50%, 0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Default therapist image placeholder
function getDefaultProfileImage() {
    return 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <rect fill="#e2e8f0" width="200" height="200"/>
            <circle fill="#94a3b8" cx="100" cy="80" r="40"/>
            <ellipse fill="#94a3b8" cx="100" cy="180" rx="60" ry="50"/>
        </svg>
    `);
}

// URL Parameter helpers
function getUrlParams() {
    return new URLSearchParams(window.location.search);
}

function setUrlParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        } else {
            url.searchParams.delete(key);
        }
    });
    window.history.pushState({}, '', url);
}
