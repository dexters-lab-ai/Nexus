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
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.success) {
      console.log('Login successful, redirecting...');
      window.location.href = '/';
      return;
    }
    errorEl.textContent = data.error;
  } catch {
    errorEl.textContent = 'Network error, please try again.';
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