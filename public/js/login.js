let isLogin = true;

function toggleForm() {
  isLogin = !isLogin;
  const formTitle = document.getElementById('form-title');
  const submitBtn = document.getElementById('submit-btn');
  const toggleLink = document.getElementById('toggle-link');
  const errorEl = document.getElementById('error-message');

  formTitle.textContent = isLogin ? 'Login' : 'Register';
  submitBtn.textContent = isLogin ? 'Login' : 'Register';
  toggleLink.textContent = isLogin ? 'Switch to Register' : 'Switch to Login';
  errorEl.style.display = 'none';
}

async function submitForm() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  const errorEl = document.getElementById('error-message');

  if (!email || !password) {
    errorEl.textContent = 'Please fill out both fields.';
    errorEl.style.display = 'block';
    return;
  }

  const url = isLogin ? '/api/auth/login' : '/api/auth/register';
  try {
    console.log(`Attempting to ${isLogin ? 'login' : 'register'}...`);
    
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ email, password }),
    });
    
    console.log(`Response status: ${res.status}`);
    
    // Handle non-JSON responses
    const contentType = res.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await res.text();
      console.error('Non-JSON response:', text);
      errorEl.textContent = `Error: Server returned non-JSON response (${res.status})`;
      errorEl.style.display = 'block';
      return;
    }
    
    const data = await res.json();
    console.log('Response data:', data);
    
    if (data.success) {
      console.log('Login successful, redirecting...');
      window.location.href = '/';
      return;
    }
    
    errorEl.textContent = data.error || 'Unknown error occurred';
  } catch (error) {
    console.error('Login error:', error);
    errorEl.textContent = `Network error: ${error.message || 'Please try again'}`;
  }
  errorEl.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('submit-btn').addEventListener('click', submitForm);
  document.getElementById('toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    toggleForm();
  });
});