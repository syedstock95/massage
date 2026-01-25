// Search Results Page JavaScript

let currentPage = 1;
let totalPages = 1;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', () => {
    initSearchPage();
    initFilters();
    loadServiceTypes();
    
    // Get search params and perform search
    const params = getUrlParams();
    const query = params.get('q');
    const service = params.get('service');
    
    if (query) {
        document.getElementById('searchInput').value = query;
        currentFilters.zip = query;
    }
    if (service) {
        currentFilters.service = service;
    }
    
    if (query || service) {
        performSearch();
    } else {
        showEmptyState('Enter a zip code or city to find massage therapists');
    }
});

// Initialize Search Page
function initSearchPage() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const suggestions = document.getElementById('searchSuggestions');
    
    // Search functionality
    searchBtn.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query) {
            currentFilters.zip = query;
            currentPage = 1;
            setUrlParams({ q: query });
            performSearch();
        }
    });
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchBtn.click();
        }
    });
    
    // Autocomplete
    const fetchSuggestions = debounce(async (query) => {
        if (query.length < 2) {
            suggestions.classList.remove('active');
            return;
        }
        
        try {
            const data = await apiRequest(`/search/zip-suggest?q=${encodeURIComponent(query)}`);
            
            if (data.suggestions?.length > 0) {
                suggestions.innerHTML = data.suggestions.map(s => `
                    <div class="suggestion-item" data-zip="${s.zip}">
                        ${s.display}
                    </div>
                `).join('');
                suggestions.classList.add('active');
                
                suggestions.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        searchInput.value = item.dataset.zip;
                        suggestions.classList.remove('active');
                        searchBtn.click();
                    });
                });
            } else {
                suggestions.classList.remove('active');
            }
        } catch (error) {
            console.error('Suggestion error:', error);
        }
    }, 300);
    
    searchInput.addEventListener('input', (e) => fetchSuggestions(e.target.value));
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.remove('active');
        }
    });
    
    // Pagination
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            performSearch();
        }
    });
    
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            performSearch();
        }
    });
}

// Initialize Filters
function initFilters() {
    const filterToggle = document.getElementById('filterToggleBtn');
    const filtersPanel = document.getElementById('filtersPanel');
    
    filterToggle.addEventListener('click', () => {
        filterToggle.classList.toggle('active');
        filtersPanel.classList.toggle('active');
    });
    
    // Filter change handlers
    const filterElements = ['filterService', 'filterRadius', 'filterRating', 'filterSort', 'filterAcceptsNew', 'filterMobile'];
    
    filterElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                currentPage = 1;
                updateFiltersFromUI();
                performSearch();
            });
        }
    });
}

// Update filters object from UI
function updateFiltersFromUI() {
    currentFilters.service = document.getElementById('filterService').value;
    currentFilters.radius = document.getElementById('filterRadius').value;
    currentFilters.minRating = document.getElementById('filterRating').value;
    currentFilters.sortBy = document.getElementById('filterSort').value;
    currentFilters.acceptsNew = document.getElementById('filterAcceptsNew').checked;
    currentFilters.offersMobile = document.getElementById('filterMobile').checked;
}

// Load Service Types for Filter
async function loadServiceTypes() {
    const select = document.getElementById('filterService');
    
    try {
        const data = await apiRequest('/services/types');
        
        if (data.services) {
            data.services.forEach(service => {
                const option = document.createElement('option');
                option.value = service.name;
                option.textContent = service.name;
                select.appendChild(option);
            });
            
            // Set initial value if in URL
            const params = getUrlParams();
            const service = params.get('service');
            if (service) {
                select.value = service;
            }
        }
    } catch (error) {
        console.log('Could not load service types');
    }
}

// Perform Search
async function performSearch() {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsHeader = document.getElementById('resultsHeader');
    const pagination = document.getElementById('pagination');
    
    // Show loading
    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    resultsGrid.innerHTML = '';
    pagination.style.display = 'none';
    
    if (!currentFilters.zip) {
        loadingState.style.display = 'none';
        showEmptyState('Enter a zip code or city to search');
        return;
    }
    
    try {
        // Build query string
        const params = new URLSearchParams({
            zip: currentFilters.zip,
            page: currentPage,
            limit: CONFIG.DEFAULT_LIMIT
        });
        
        if (currentFilters.service) params.append('service', currentFilters.service);
        if (currentFilters.radius) params.append('radius', currentFilters.radius);
        if (currentFilters.minRating) params.append('minRating', currentFilters.minRating);
        if (currentFilters.sortBy) params.append('sortBy', currentFilters.sortBy);
        if (currentFilters.acceptsNew) params.append('acceptsNew', 'true');
        if (currentFilters.offersMobile) params.append('offersMobile', 'true');
        
        const data = await apiRequest(`/search?${params}`);
        
        loadingState.style.display = 'none';
        
        if (!data.therapists || data.therapists.length === 0) {
            showEmptyState('No therapists found. Try expanding your search radius.');
            return;
        }
        
        // Update header
        const location = data.search.city ? `${data.search.city}, ${data.search.state}` : data.search.zip;
        document.getElementById('resultsTitle').textContent = `Massage Therapists near ${location}`;
        document.getElementById('resultsCount').textContent = `${data.pagination.total} therapists found within ${data.search.radius} miles`;
        
        // Render results
        renderResults(data.therapists);
        
        // Update pagination
        totalPages = data.pagination.totalPages;
        updatePagination(data.pagination);
        
    } catch (error) {
        console.error('Search error:', error);
        loadingState.style.display = 'none';
        showEmptyState('Search failed. Please try again.');
    }
}

// Render Search Results
function renderResults(therapists) {
    const grid = document.getElementById('resultsGrid');
    
    grid.innerHTML = therapists.map(t => {
        const name = t.business_name || `${t.first_name} ${t.last_name}`;
        const image = t.profile_image || getDefaultProfileImage();
        const services = t.services?.slice(0, 3).map(s => s.name).join(', ') || 'Various services';
        const minPrice = t.services?.[0]?.price;
        
        let badges = '';
        if (t.is_verified) badges += '<span class="badge badge-verified">Verified</span>';
        if (t.subscription_tier === 'premium') badges += '<span class="badge badge-featured">Featured</span>';
        else if (t.subscription_tier === 'pro') badges += '<span class="badge badge-pro">Pro</span>';
        
        return `
            <article class="therapist-card">
                <a href="therapist.html?id=${t.id}">
                    <img src="${image}" alt="${name}" class="therapist-image" onerror="this.src='${getDefaultProfileImage()}'">
                    <div class="therapist-content">
                        <div class="therapist-header">
                            <h2 class="therapist-name">${name}</h2>
                            <div class="therapist-badges">${badges}</div>
                        </div>
                        
                        <div class="therapist-location">
                            <span class="material-icons-round">location_on</span>
                            ${t.city}, ${t.state}
                        </div>
                        
                        <div class="therapist-rating">
                            ${generateStarRating(t.rating_average || 0, t.rating_count || 0)}
                        </div>
                        
                        <div class="therapist-services">
                            ${t.services?.slice(0, 3).map(s => `<span class="service-tag">${s.name}</span>`).join('') || ''}
                        </div>
                        
                        ${minPrice ? `<div class="therapist-price">From ${formatCurrency(minPrice)}</div>` : ''}
                        
                        <div class="therapist-footer">
                            <div class="distance">
                                <span class="material-icons-round">near_me</span>
                                ${t.distance_miles} miles away
                            </div>
                            <span class="view-profile-btn">View Profile</span>
                        </div>
                    </div>
                </a>
            </article>
        `;
    }).join('');
}

// Update Pagination
function updatePagination(pagination) {
    const paginationEl = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const info = document.getElementById('paginationInfo');
    
    if (pagination.totalPages > 1) {
        paginationEl.style.display = 'flex';
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage >= pagination.totalPages;
        info.textContent = `Page ${currentPage} of ${pagination.totalPages}`;
    } else {
        paginationEl.style.display = 'none';
    }
}

// Show Empty State
function showEmptyState(message) {
    const emptyState = document.getElementById('emptyState');
    emptyState.querySelector('p').textContent = message;
    emptyState.style.display = 'block';
    document.getElementById('resultsTitle').textContent = 'Search Results';
    document.getElementById('resultsCount').textContent = '';
}
