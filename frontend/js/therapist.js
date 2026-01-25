// Therapist Profile Page JavaScript

let therapist = null;
let selectedService = null;

document.addEventListener('DOMContentLoaded', () => {
    const params = getUrlParams();
    const therapistId = params.get('id');
    
    if (!therapistId) {
        showNotFound();
        return;
    }
    
    loadTherapistProfile(therapistId);
});

// Load Therapist Profile
async function loadTherapistProfile(id) {
    const loadingState = document.getElementById('loadingState');
    const profileContent = document.getElementById('profileContent');
    const notFoundState = document.getElementById('notFoundState');
    
    try {
        const data = await apiRequest(`/therapists/${id}`);
        therapist = data.therapist;
        
        if (!therapist) {
            showNotFound();
            return;
        }
        
        renderProfile();
        loadingState.style.display = 'none';
        profileContent.style.display = 'block';
        
    } catch (error) {
        console.error('Failed to load profile:', error);
        showNotFound();
    }
}

// Render Profile
function renderProfile() {
    // Update page title
    const name = therapist.businessName || `${therapist.firstName} ${therapist.lastName}`;
    document.title = `${name} | MassageNearMe`;
    
    // Profile image
    const profileImage = document.getElementById('profileImage');
    profileImage.src = therapist.profileImage || getDefaultProfileImage();
    profileImage.alt = name;
    profileImage.onerror = () => { profileImage.src = getDefaultProfileImage(); };
    
    // Name
    document.getElementById('profileName').textContent = name;
    
    // Location
    document.getElementById('profileLocation').innerHTML = `
        <span class="material-icons-round">location_on</span>
        <span>${therapist.city || ''}, ${therapist.state || ''}</span>
    `;
    
    // Badges
    let badges = '';
    if (therapist.isVerified) badges += '<span class="badge badge-verified">Verified</span>';
    if (therapist.subscriptionTier === 'premium') badges += '<span class="badge badge-featured">Featured</span>';
    else if (therapist.subscriptionTier === 'pro') badges += '<span class="badge badge-pro">Pro</span>';
    document.getElementById('profileBadges').innerHTML = badges;
    
    // Rating
    document.getElementById('profileRating').innerHTML = generateStarRating(
        therapist.ratingAverage || 0, 
        therapist.ratingCount || 0
    );
    
    // Meta (experience, license)
    const meta = [];
    if (therapist.yearsExperience) {
        meta.push(`<span class="material-icons-round">badge</span> ${therapist.yearsExperience} years experience`);
    }
    if (therapist.licenseNumber && therapist.licenseState) {
        meta.push(`<span class="material-icons-round">verified</span> Licensed in ${therapist.licenseState}`);
    }
    document.getElementById('profileMeta').innerHTML = meta.map(m => `<span>${m}</span>`).join('');
    
    // Bio
    document.getElementById('profileBio').textContent = therapist.bio || 'No bio available.';
    
    // Services
    renderServices();
    
    // Reviews
    renderReviews();
    
    // Availability
    renderAvailability();
    
    // Booking section
    setupBooking();
}

// Render Services
function renderServices() {
    const list = document.getElementById('servicesList');
    const services = therapist.services || [];
    
    if (services.length === 0) {
        list.innerHTML = '<p class="no-data">No services listed.</p>';
        return;
    }
    
    list.innerHTML = services.map(service => `
        <div class="service-row">
            <div>
                <div class="service-name">${service.name}</div>
                <div class="service-duration">${service.duration_minutes} minutes</div>
            </div>
            <div class="service-price">${formatCurrency(service.price)}</div>
        </div>
    `).join('');
}

// Render Reviews
function renderReviews() {
    const container = document.getElementById('reviewsContainer');
    const reviews = therapist.reviews || [];
    
    if (reviews.length === 0) {
        container.innerHTML = '<p class="no-data">No reviews yet.</p>';
        return;
    }
    
    container.innerHTML = reviews.map(review => `
        <div class="review-card">
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
}

// Render Availability
function renderAvailability() {
    const list = document.getElementById('availabilityList');
    const availability = therapist.availability || [];
    
    if (availability.length === 0) {
        list.innerHTML = '<p class="no-data">Not specified</p>';
        return;
    }
    
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byDay = {};
    
    availability.forEach(slot => {
        byDay[slot.day_of_week] = slot;
    });
    
    list.innerHTML = days.map((day, index) => {
        const slot = byDay[index];
        if (slot) {
            return `
                <div class="availability-row">
                    <span class="availability-day">${day}</span>
                    <span class="availability-time">${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}</span>
                </div>
            `;
        }
        return `
            <div class="availability-row">
                <span class="availability-day">${day}</span>
                <span class="availability-closed">Closed</span>
            </div>
        `;
    }).join('');
}

// Setup Booking
function setupBooking() {
    const bookingContact = document.getElementById('bookingContact');
    const bookingForm = document.getElementById('bookingForm');
    const bookingFreeNotice = document.getElementById('bookingFreeNotice');
    
    const services = therapist.services || [];
    const isPro = therapist.subscriptionTier === 'pro' || therapist.subscriptionTier === 'premium';
    
    if (isPro && services.length > 0) {
        // Show booking form for Pro/Premium
        bookingForm.style.display = 'block';
        
        // Populate services dropdown
        const serviceSelect = document.getElementById('bookingService');
        serviceSelect.innerHTML = '<option value="">Choose a service...</option>' +
            services.map(s => `
                <option value="${s.id}" data-price="${s.price}" data-duration="${s.duration_minutes}" data-name="${s.name}">
                    ${s.name} - ${s.duration_minutes} min - ${formatCurrency(s.price)}
                </option>
            `).join('');
        
        // Set min date to today
        const dateInput = document.getElementById('bookingDate');
        const today = new Date().toISOString().split('T')[0];
        dateInput.min = today;
        
        initBookingForm();
        
    } else if (therapist.phone || therapist.email) {
        // Show contact options for Free tier with contact info
        bookingContact.style.display = 'block';
        
        if (therapist.phone) {
            const phoneLink = document.getElementById('contactPhone');
            phoneLink.href = `tel:${therapist.phone}`;
            phoneLink.querySelector('span:last-child').textContent = therapist.phone;
        } else {
            document.getElementById('contactPhone').style.display = 'none';
        }
        
        if (therapist.email) {
            const emailLink = document.getElementById('contactEmail');
            emailLink.href = `mailto:${therapist.email}`;
        } else {
            document.getElementById('contactEmail').style.display = 'none';
        }
        
    } else {
        // Show notice for Free tier without contact
        bookingFreeNotice.style.display = 'flex';
    }
}

// Initialize Booking Form
function initBookingForm() {
    const serviceSelect = document.getElementById('bookingService');
    const dateInput = document.getElementById('bookingDate');
    const timeSelect = document.getElementById('bookingTime');
    const form = document.getElementById('bookingForm');
    const summary = document.getElementById('bookingSummary');
    
    // Service selection
    serviceSelect.addEventListener('change', () => {
        const option = serviceSelect.options[serviceSelect.selectedIndex];
        if (option.value) {
            selectedService = {
                id: option.value,
                name: option.dataset.name,
                price: option.dataset.price,
                duration: option.dataset.duration
            };
            updateBookingSummary();
            
            // Check availability if date is selected
            if (dateInput.value) {
                loadAvailableSlots();
            }
        } else {
            selectedService = null;
            summary.style.display = 'none';
        }
    });
    
    // Date selection
    dateInput.addEventListener('change', () => {
        if (dateInput.value && selectedService) {
            loadAvailableSlots();
        }
    });
    
    // Form submission
    form.addEventListener('submit', submitBooking);
}

// Load Available Time Slots
async function loadAvailableSlots() {
    const dateInput = document.getElementById('bookingDate');
    const timeSelect = document.getElementById('bookingTime');
    
    timeSelect.disabled = true;
    timeSelect.innerHTML = '<option value="">Loading...</option>';
    
    try {
        const data = await apiRequest(
            `/bookings/availability/${therapist.id}/${dateInput.value}?serviceId=${selectedService.id}`
        );
        
        const slots = data.slots || [];
        
        if (slots.length === 0) {
            timeSelect.innerHTML = '<option value="">No available times</option>';
            return;
        }
        
        timeSelect.innerHTML = '<option value="">Select a time...</option>' +
            slots.map(slot => `
                <option value="${slot.startTime}">${slot.display}</option>
            `).join('');
        
        timeSelect.disabled = false;
        
    } catch (error) {
        console.error('Failed to load slots:', error);
        timeSelect.innerHTML = '<option value="">Failed to load times</option>';
    }
}

// Update Booking Summary
function updateBookingSummary() {
    const summary = document.getElementById('bookingSummary');
    
    if (!selectedService) {
        summary.style.display = 'none';
        return;
    }
    
    document.getElementById('summaryService').textContent = selectedService.name;
    document.getElementById('summaryDuration').textContent = `${selectedService.duration} minutes`;
    document.getElementById('summaryPrice').textContent = formatCurrency(selectedService.price);
    
    summary.style.display = 'block';
}

// Submit Booking
async function submitBooking(e) {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('.booking-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span>';
    
    const data = {
        therapistId: therapist.id,
        serviceId: selectedService.id,
        bookingDate: document.getElementById('bookingDate').value,
        startTime: document.getElementById('bookingTime').value,
        consumerName: document.getElementById('bookingName').value,
        consumerEmail: document.getElementById('bookingEmail').value,
        consumerPhone: document.getElementById('bookingPhone').value,
        notes: document.getElementById('bookingNotes').value
    };
    
    try {
        await apiRequest('/bookings', {
            method: 'POST',
            body: JSON.stringify(data)
        });
        
        showToast('Booking request submitted! The therapist will confirm soon.', 'success');
        
        // Reset form
        e.target.reset();
        document.getElementById('bookingSummary').style.display = 'none';
        selectedService = null;
        
    } catch (error) {
        showToast(error.message || 'Failed to submit booking', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Request Booking</span><span class="material-icons-round">arrow_forward</span>';
    }
}

// Show Not Found
function showNotFound() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'none';
    document.getElementById('notFoundState').style.display = 'block';
}

// Format time helper
function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes} ${period}`;
}
