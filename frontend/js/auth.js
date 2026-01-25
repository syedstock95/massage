// Auth Page JavaScript

document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const user = getCurrentUser();
    if (user) {
        redirectToDashboard(user);
        return;
    }
    
    initAuthForms();
    initPasswordToggle();
    initAccountTypeToggle();
    
    // Check URL params
    const params = getUrlParams();
    if (params.get('register') === 'therapist') {
        showRegisterForm();
        document.querySelector('[data-type="therapist"]').click();
    } else if (params.get('register')) {
        showRegisterForm();
    }
});

// Initialize Auth Forms
function initAuthForms() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    
    // Toggle between forms
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
    });
    
    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });
    
    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginError');
        const submitBtn = loginForm.querySelector('.auth-btn');
        
        errorEl.classList.remove('active');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span>';
        
        try {
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            
            // Save auth data
            setAuthToken(data.token);
            setCurrentUser(data.user);
            
            showToast('Login successful!', 'success');
            
            // Redirect
            setTimeout(() => redirectToDashboard(data.user), 500);
            
        } catch (error) {
            errorEl.textContent = error.message || 'Login failed. Please try again.';
            errorEl.classList.add('active');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In</span><span class="material-icons-round">arrow_forward</span>';
        }
    });
    
    // Register form submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const firstName = document.getElementById('registerFirstName').value;
        const lastName = document.getElementById('registerLastName').value;
        const email = document.getElementById('registerEmail').value;
        const phone = document.getElementById('registerPhone').value;
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;
        const role = document.getElementById('registerRole').value;
        const terms = document.getElementById('registerTerms').checked;
        
        const errorEl = document.getElementById('registerError');
        const submitBtn = registerForm.querySelector('.auth-btn');
        
        errorEl.classList.remove('active');
        
        // Validation
        if (password !== confirmPassword) {
            errorEl.textContent = 'Passwords do not match';
            errorEl.classList.add('active');
            return;
        }
        
        if (password.length < 8) {
            errorEl.textContent = 'Password must be at least 8 characters';
            errorEl.classList.add('active');
            return;
        }
        
        if (!terms) {
            errorEl.textContent = 'Please agree to the Terms of Service';
            errorEl.classList.add('active');
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;"></span>';
        
        try {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    password,
                    firstName,
                    lastName,
                    phone,
                    role
                })
            });
            
            // Save auth data
            setAuthToken(data.token);
            setCurrentUser(data.user);
            
            showToast('Account created successfully!', 'success');
            
            // Redirect
            setTimeout(() => redirectToDashboard(data.user), 500);
            
        } catch (error) {
            errorEl.textContent = error.message || 'Registration failed. Please try again.';
            errorEl.classList.add('active');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account</span><span class="material-icons-round">arrow_forward</span>';
        }
    });
}

// Password visibility toggle
function initPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const icon = btn.querySelector('.material-icons-round');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    });
}

// Account type toggle (consumer/therapist)
function initAccountTypeToggle() {
    const typeButtons = document.querySelectorAll('.type-btn');
    const roleInput = document.getElementById('registerRole');
    
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            roleInput.value = btn.dataset.type;
        });
    });
}

// Show register form
function showRegisterForm() {
    document.getElementById('loginCard').style.display = 'none';
    document.getElementById('registerCard').style.display = 'block';
}

// Show login form
function showLoginForm() {
    document.getElementById('registerCard').style.display = 'none';
    document.getElementById('loginCard').style.display = 'block';
}

// Redirect to appropriate dashboard
function redirectToDashboard(user) {
    if (user.role === 'therapist') {
        window.location.href = 'dashboard.html';
    } else {
        window.location.href = 'index.html';
    }
}
