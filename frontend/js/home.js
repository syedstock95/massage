// Home Page JavaScript

document.addEventListener('DOMContentLoaded', () => {
    initHomeSearch();
    initQuickFilters();
    loadPopularServices();
});

// Home Search Functionality
function initHomeSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const suggestions = document.getElementById('searchSuggestions');
    
    if (!searchInput) return;
    
    // Load recent zip from storage
    const recentZip = localStorage.getItem(CONFIG.STORAGE_KEYS.RECENT_ZIP);
    if (recentZip) {
        searchInput.placeholder = `Last search: ${recentZip}`;
    }
    
    // Search on Enter or button click
    const performSearch = () => {
        const query = searchInput.value.trim();
        if (query) {
            localStorage.setItem(CONFIG.STORAGE_KEYS.RECENT_ZIP, query);
            window.location.href = `search.html?q=${encodeURIComponent(query)}`;
        }
    };
    
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    // Autocomplete suggestions
    const fetchSuggestions = debounce(async (query) => {
        if (query.length < 2) {
            suggestions.classList.remove('active');
            return;
        }
        
        try {
            const data = await apiRequest(`/search/zip-suggest?q=${encodeURIComponent(query)}`);
            
            if (data.suggestions && data.suggestions.length > 0) {
                suggestions.innerHTML = data.suggestions.map(s => `
                    <div class="suggestion-item" data-zip="${s.zip}" data-display="${s.display}">
                        <span class="material-icons-round" style="font-size: 18px; color: var(--primary); margin-right: 8px;">location_on</span>
                        ${s.display}
                    </div>
                `).join('');
                suggestions.classList.add('active');
                
                // Handle suggestion clicks
                suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        searchInput.value = item.dataset.zip;
                        suggestions.classList.remove('active');
                        performSearch();
                    });
                });
            } else {
                suggestions.classList.remove('active');
            }
        } catch (error) {
            console.error('Suggestion error:', error);
        }
    }, 300);
    
    searchInput.addEventListener('input', (e) => {
        fetchSuggestions(e.target.value);
    });
    
    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.remove('active');
        }
    });
}

// Quick Filter Buttons
function initQuickFilters() {
    const filters = document.querySelectorAll('.quick-filter');
    const searchInput = document.getElementById('searchInput');
    
    filters.forEach(filter => {
        filter.addEventListener('click', () => {
            const service = filter.dataset.service;
            const query = searchInput.value.trim();
            
            if (query) {
                window.location.href = `search.html?q=${encodeURIComponent(query)}&service=${encodeURIComponent(service)}`;
            } else {
                searchInput.focus();
                searchInput.placeholder = `Enter location to find ${service} massage...`;
            }
        });
    });
}

// Load Popular Services
async function loadPopularServices() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    
    // Default services (used if API not available)
    const defaultServices = [
        { id: 1, name: 'Swedish Massage', description: 'Gentle, relaxing full-body massage', icon: 'spa' },
        { id: 2, name: 'Deep Tissue', description: 'Firm pressure for muscle relief', icon: 'fitness_center' },
        { id: 3, name: 'Hot Stone', description: 'Heated stones for deep relaxation', icon: 'whatshot' },
        { id: 4, name: 'Sports Massage', description: 'Athletic recovery and performance', icon: 'sports' },
        { id: 5, name: 'Thai Massage', description: 'Stretching and pressure points', icon: 'self_improvement' },
        { id: 6, name: 'Prenatal', description: 'Safe massage for expecting mothers', icon: 'pregnant_woman' },
        { id: 7, name: 'Reflexology', description: 'Foot and hand pressure therapy', icon: 'back_hand' },
        { id: 8, name: 'Aromatherapy', description: 'Essential oils with massage', icon: 'local_florist' }
    ];
    
    try {
        const data = await apiRequest('/services/popular?limit=8');
        renderServices(data.services || defaultServices);
    } catch (error) {
        console.log('Using default services');
        renderServices(defaultServices);
    }
    
    function renderServices(services) {
        grid.innerHTML = services.map(service => `
            <div class="service-card" data-service="${service.name}">
                <div class="service-icon">
                    <span class="material-icons-round">${service.icon || 'spa'}</span>
                </div>
                <div class="service-info">
                    <div class="service-name">${service.name}</div>
                    <div class="service-desc">${service.description}</div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        grid.querySelectorAll('.service-card').forEach(card => {
            card.addEventListener('click', () => {
                const service = card.dataset.service;
                const searchInput = document.getElementById('searchInput');
                const query = searchInput?.value.trim();
                
                if (query) {
                    window.location.href = `search.html?q=${encodeURIComponent(query)}&service=${encodeURIComponent(service)}`;
                } else {
                    window.location.href = `search.html?service=${encodeURIComponent(service)}`;
                }
            });
        });
    }
}
