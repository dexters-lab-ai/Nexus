import { setAuthState, clearAuthState } from './utils/auth.js';

let isLogin = true;

function toggleForm() {
  isLogin = !isLogin;
  const formTitle = document.getElementById('form-title');
  const submitBtn = document.getElementById('submit-btn');
  const toggleLink = document.getElementById('toggle-link');
  const errorEl = document.getElementById('error-message');
  const loadingIndicator = document.getElementById('loading-indicator');

  formTitle.textContent = isLogin ? 'Login' : 'Register';
  submitBtn.textContent = isLogin ? 'Login' : 'Register';
  toggleLink.textContent = isLogin ? 'Switch to Register' : 'Switch to Login';
  errorEl.style.display = 'none';
  
  // Clear any previous input
  document.getElementById('email').value = '';
  document.getElementById('password').value = '';
}

async function submitForm() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('error-message');
  const submitBtn = document.getElementById('submit-btn');
  const originalBtnText = submitBtn.textContent;

  if (!email || !password) {
    showError('Please fill out both fields.');
    return;
  }

  try {
    // Show loading state
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
    
    const url = isLogin ? '/api/auth/login' : '/api/auth/register';
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ email, password }),
    });
    
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error(`Server returned ${res.status}: ${text}`);
    }
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }
    
    if (data.success && data.user && data.token) {
      // Update auth state with user data and token
      setAuthState(data.user._id, data.token);
      
      // Redirect to home or intended URL
      const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/';
      window.location.href = redirectTo;
      return;
    }
    
    throw new Error(data.error || 'Authentication failed');
  } catch (error) {
    console.error('Auth error:', error);
    showError(error.message || 'An error occurred. Please try again.');
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  
  // Auto-hide error after 5 seconds
  setTimeout(() => {
    errorEl.style.display = 'none';
  }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('submit-btn').addEventListener('click', submitForm);
  document.getElementById('toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    toggleForm();
  });
});