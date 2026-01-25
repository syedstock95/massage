// Dashboard JavaScript

let currentUser = null;
let therapistProfile = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'therapist') {
        window.location.href = 'login.html';
        return;
    }
    
    initDashboard();
    initSidebar();
    initNavigation();
    loadDashboardData();
});

// Initialize Dashboard
function initDashboard() {
    // Set user name
    document.getElementById('userName').textContent = currentUser.firstName || 'Therapist';
    
    // Set view profile link
    if (currentUser.therapistId) {
        document.getElementById('viewProfileLink').href = `therapist.html?id=${currentUser.therapistId}`;
    }
    
    // Logout handler
    document.getElementById('logoutBtn').addEventListener('click', () => {
        removeAuthToken();
        window.location.href = 'index.html';
    });
    
    // Initialize forms
    initProfileForm();
    initServiceForm();
    initAvailabilityForm();
}

// Sidebar Toggle (Mobile)
function initSidebar() {
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    });
    
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    });
}

// Navigation between sections
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const pageTitle = document.getElementById('pageTitle');
    
    const showSection = (sectionId) => {
        // Update nav
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.section === sectionId);
        });
        
        // Update sections
        sections.forEach(section => {
            section.classList.toggle('active', section.id === `section-${sectionId}`);
        });
        
        // Update title
        const titles = {
            overview: 'Dashboard',
            bookings: 'Bookings',
            profile: 'My Profile',
            services: 'My Services',
            availability: 'Availability',
            reviews: 'Reviews'
        };
        pageTitle.textContent = titles[sectionId] || 'Dashboard';
        
        // Close mobile sidebar
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('sidebarOverlay').classList.remove('active');
    };
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(item.dataset.section);
        });
    });
    
    // Quick action buttons
    document.querySelectorAll('.action-btn[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            showSection(btn.dataset.section);
        });
    });
    
    // View all links
    document.querySelectorAll('.view-all-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.getAttribute('href').replace('#', '');
            showSection(section);
        });
    });
}

// Load Dashboard Data
async function loadDashboardData() {
    try {
        // Load user profile
        const userData = await apiRequest('/auth/me');
        therapistProfile = userData.therapist;
        
        // Update upgrade button visibility
        if (therapistProfile?.subscription_tier !== 'free') {
            document.getElementById('upgradeBtn').classList.add('hidden');
        }
        
        // Load stats
        loadStats();
        
        // Load bookings
        loadBookings();
        
        // Populate profile form
        populateProfileForm();
        
        // Load services
        loadServices();
        
        // Load service types for dropdown
        loadServiceTypes();
        
        // Build availability form
        buildAvailabilityForm();
        
        // Load reviews
        loadReviews();
        
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        if (error.message.includes('token') || error.message.includes('expired')) {
            removeAuthToken();
            window.location.href = 'login.html';
        }
    }
}

// Load Stats
async function loadStats() {
    try {
        const data = await apiRequest('/therapists/dashboard/stats');
        const stats = data.stats;
        
        document.getElementById('statViews').textContent = stats.views || 0;
        document.getElementById('statBookings').textContent = stats.totalBookings || 0;
        document.getElementById('statRating').textContent = (stats.rating || 0).toFixed(1);
        document.getElementById('statRevenue').textContent = formatCurrency(stats.monthlyRevenue || 0);
        
        // Update pending count badge
        const pendingCount = stats.bookings?.pending || 0;
        const badge = document.getElementById('pendingCount');
        badge.textContent = pendingCount > 0 ? pendingCount : '';
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load Bookings
async function loadBookings(status = '') {
    const tableBody = document.getElementById('bookingsTableBody');
    const upcomingList = document.getElementById('upcomingBookings');
    
    try {
        const params = new URLSearchParams({ limit: 50 });
        if (status) params.append('status', status);
        
        const data = await apiRequest(`/bookings/therapist?${params}`);
        const bookings = data.bookings || [];
        
        if (bookings.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">No bookings found</td></tr>';
            return;
        }
        
        // Render table
        tableBody.innerHTML = bookings.map(booking => `
            <tr>
                <td>
                    <strong>${booking.consumer_name || `${booking.consumer_first_name || ''} ${booking.consumer_last_name || ''}`.trim() || 'Guest'}</strong>
                    <br><small>${booking.consumer_email || booking.consumer_phone || ''}</small>
                </td>
                <td>${booking.service_name}</td>
                <td>
                    ${formatDate(booking.booking_date)}
                    <br><small>${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}</small>
                </td>
                <td>${formatCurrency(booking.price)}</td>
                <td><span class="booking-status status-${booking.status}">${booking.status}</span></td>
                <td>
                    ${booking.status === 'pending' ? `
                        <button class="btn-small btn-success" onclick="updateBookingStatus('${booking.id}', 'confirmed')">Confirm</button>
                        <button class="btn-small btn-danger" onclick="updateBookingStatus('${booking.id}', 'cancelled')">Cancel</button>
                    ` : booking.status === 'confirmed' ? `
                        <button class="btn-small" onclick="updateBookingStatus('${booking.id}', 'completed')">Complete</button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
        
        // Render upcoming (for overview)
        const upcoming = bookings.filter(b => 
            b.status === 'confirmed' && new Date(b.booking_date) >= new Date()
        ).slice(0, 3);
        
        if (upcoming.length > 0) {
            upcomingList.innerHTML = upcoming.map(booking => `
                <div class="booking-item">
                    <div class="booking-info">
                        <div class="booking-avatar">${(booking.consumer_name || 'G')[0].toUpperCase()}</div>
                        <div class="booking-details">
                            <h4>${booking.consumer_name || 'Guest'}</h4>
                            <p>${booking.service_name} - ${formatDate(booking.booking_date)} at ${formatTime(booking.start_time)}</p>
                        </div>
                    </div>
                    <span class="booking-status status-${booking.status}">${booking.status}</span>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Failed to load bookings:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="empty-cell">Failed to load bookings</td></tr>';
    }
}

// Update Booking Status
async function updateBookingStatus(bookingId, status) {
    try {
        await apiRequest(`/bookings/${bookingId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        
        showToast(`Booking ${status}`, 'success');
        loadBookings();
        loadStats();
        
    } catch (error) {
        showToast('Failed to update booking', 'error');
    }
}

// Profile Form
function initProfileForm() {
    const form = document.getElementById('profileForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            businessName: document.getElementById('businessName').value,
            bio: document.getElementById('bio').value,
            yearsExperience: document.getElementById('yearsExperience').value || null,
            licenseNumber: document.getElementById('licenseNumber').value,
            licenseState: document.getElementById('licenseState').value,
            addressLine1: document.getElementById('addressLine1').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zip: document.getElementById('zip').value,
            phone: document.getElementById('phone').value,
            website: document.getElementById('website').value,
            acceptsNewClients: document.getElementById('acceptsNewClients').checked,
            offersMobile: document.getElementById('offersMobile').checked
        };
        
        try {
            await apiRequest('/therapists/profile', {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            
            showToast('Profile saved successfully!', 'success');
            
        } catch (error) {
            showToast('Failed to save profile', 'error');
        }
    });
}

function populateProfileForm() {
    if (!therapistProfile) return;
    
    document.getElementById('businessName').value = therapistProfile.business_name || '';
    document.getElementById('bio').value = therapistProfile.bio || '';
    document.getElementById('yearsExperience').value = therapistProfile.years_experience || '';
    document.getElementById('licenseNumber').value = therapistProfile.license_number || '';
    document.getElementById('licenseState').value = therapistProfile.license_state || '';
    document.getElementById('addressLine1').value = therapistProfile.address_line1 || '';
    document.getElementById('city').value = therapistProfile.city || '';
    document.getElementById('state').value = therapistProfile.state || '';
    document.getElementById('zip').value = therapistProfile.zip || '';
    document.getElementById('phone').value = therapistProfile.phone || '';
    document.getElementById('website').value = therapistProfile.website || '';
    document.getElementById('acceptsNewClients').checked = therapistProfile.accepts_new_clients !== false;
    document.getElementById('offersMobile').checked = therapistProfile.offers_mobile || false;
}

// Services
async function loadServices() {
    const list = document.getElementById('servicesList');
    
    try {
        const userData = await apiRequest('/auth/me');
        const therapistId = userData.therapist?.id;
        
        if (!therapistId) {
            list.innerHTML = '<div class="empty-state"><p>Complete your profile to add services</p></div>';
            return;
        }
        
        const data = await apiRequest(`/therapists/${therapistId}`);
        const services = data.therapist?.services || [];
        
        if (services.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">spa</span>
                    <h3>No services added yet</h3>
                    <p>Add the massage services you offer to attract clients</p>
                    <button class="btn-primary" onclick="openServiceModal()">Add Your First Service</button>
                </div>
            `;
            return;
        }
        
        list.innerHTML = services.map(service => `
            <div class="service-item">
                <div class="service-item-header">
                    <h4>${service.name}</h4>
                    <div class="service-item-actions">
                        <button class="icon-btn delete" onclick="deleteService(${service.id})">
                            <span class="material-icons-round">delete</span>
                        </button>
                    </div>
                </div>
                <div class="service-item-details">
                    <span><span class="material-icons-round">schedule</span> ${service.duration_minutes} min</span>
                </div>
                <div class="service-item-price">${formatCurrency(service.price)}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load services:', error);
    }
}

async function loadServiceTypes() {
    const select = document.getElementById('serviceType');
    
    try {
        const data = await apiRequest('/services/types');
        
        data.services?.forEach(service => {
            const option = document.createElement('option');
            option.value = service.id;
            option.textContent = service.name;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Failed to load service types:', error);
    }
}

function initServiceForm() {
    const modal = document.getElementById('serviceModal');
    const form = document.getElementById('serviceForm');
    const addBtn = document.getElementById('addServiceBtn');
    const closeBtn = document.getElementById('closeServiceModal');
    const cancelBtn = document.getElementById('cancelService');
    const firstBtn = document.getElementById('addFirstService');
    
    const openModal = () => modal.classList.add('active');
    const closeModal = () => modal.classList.remove('active');
    
    window.openServiceModal = openModal;
    
    addBtn?.addEventListener('click', openModal);
    firstBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const data = {
            serviceTypeId: document.getElementById('serviceType').value,
            durationMinutes: document.getElementById('serviceDuration').value,
            price: document.getElementById('servicePrice').value,
            description: document.getElementById('serviceDescription').value
        };
        
        try {
            await apiRequest('/therapists/services', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            
            showToast('Service added!', 'success');
            closeModal();
            form.reset();
            loadServices();
            
        } catch (error) {
            showToast(error.message || 'Failed to add service', 'error');
        }
    });
}

async function deleteService(serviceId) {
    if (!confirm('Are you sure you want to remove this service?')) return;
    
    try {
        await apiRequest(`/therapists/services/${serviceId}`, { method: 'DELETE' });
        showToast('Service removed', 'success');
        loadServices();
    } catch (error) {
        showToast('Failed to remove service', 'error');
    }
}

// Availability
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildAvailabilityForm() {
    const grid = document.getElementById('availabilityGrid');
    
    grid.innerHTML = DAYS.map((day, index) => `
        <div class="availability-day">
            <div class="day-toggle">
                <input type="checkbox" id="day${index}" data-day="${index}">
                <label for="day${index}">${day}</label>
            </div>
            <div class="day-hours">
                <input type="time" id="start${index}" value="09:00" disabled>
                <span>to</span>
                <input type="time" id="end${index}" value="17:00" disabled>
            </div>
        </div>
    `).join('');
    
    // Enable/disable time inputs
    grid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const day = cb.dataset.day;
            document.getElementById(`start${day}`).disabled = !cb.checked;
            document.getElementById(`end${day}`).disabled = !cb.checked;
        });
    });
}

function initAvailabilityForm() {
    const form = document.getElementById('availabilityForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const availability = [];
        
        DAYS.forEach((day, index) => {
            const enabled = document.getElementById(`day${index}`).checked;
            if (enabled) {
                availability.push({
                    dayOfWeek: index,
                    startTime: document.getElementById(`start${index}`).value,
                    endTime: document.getElementById(`end${index}`).value
                });
            }
        });
        
        try {
            await apiRequest('/therapists/availability', {
                method: 'POST',
                body: JSON.stringify({ availability })
            });
            
            showToast('Availability saved!', 'success');
            
        } catch (error) {
            showToast('Failed to save availability', 'error');
        }
    });
}

// Reviews
async function loadReviews() {
    const summary = document.getElementById('reviewsSummary');
    const list = document.getElementById('reviewsList');
    
    if (!therapistProfile) return;
    
    const rating = parseFloat(therapistProfile.rating_average) || 0;
    const count = therapistProfile.rating_count || 0;
    
    // Update summary
    document.getElementById('avgRating').textContent = rating.toFixed(1);
    document.getElementById('ratingStars').innerHTML = generateStarRating(rating);
    document.getElementById('reviewCount').textContent = `${count} reviews`;
    
    // Load reviews from profile
    try {
        const data = await apiRequest(`/therapists/${therapistProfile.id}`);
        const reviews = data.therapist?.reviews || [];
        
        if (reviews.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons-round">rate_review</span>
                    <h3>No reviews yet</h3>
                    <p>Reviews will appear here after clients book and rate your services</p>
                </div>
            `;
            return;
        }
        
        list.innerHTML = reviews.map(review => `
            <div class="review-item">
                <div class="review-header">
                    <div>
                        <span class="review-author">${review.first_name || 'Anonymous'}</span>
                        ${generateStarRating(review.rating)}
                    </div>
                    <span class="review-date">${formatDate(review.created_at)}</span>
                </div>
                ${review.comment ? `<p class="review-content">${review.comment}</p>` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load reviews:', error);
    }
}

// Filter tabs for bookings
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        loadBookings(tab.dataset.status);
    });
});

// Helper: Format time
function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${period}`;
}

// Make functions globally available
window.updateBookingStatus = updateBookingStatus;
window.deleteService = deleteService;
