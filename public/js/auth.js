const API_BASE = '/api';

// Store auth data after login
export function saveSession(token, staff, event_id) {
  sessionStorage.setItem('token', token);
  sessionStorage.setItem('staff', JSON.stringify(staff));
  sessionStorage.setItem('event_id', event_id);
}

// Retrieve session
export function getSession() {
  const token = sessionStorage.getItem('token');
  const staff = JSON.parse(sessionStorage.getItem('staff') || 'null');
  const event_id = sessionStorage.getItem('event_id');
  return { token, staff, event_id };
}

// Clear session and redirect to login
export function logout() {
  sessionStorage.clear();
  window.location.href = '/index.html';
}

// Protect a page — call at top of every protected page script
// Pass the allowed roles for that page
export function requireAuth(allowedRoles = []) {
  const { token, staff } = getSession();
  if (!token || !staff) {
    window.location.href = '/index.html';
    return null;
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(staff.role)) {
    window.location.href = '/index.html';
    return null;
  }
  return staff;
}

// Shared fetch helper — attaches JWT automatically
export async function apiFetch(path, options = {}) {
  const { token } = getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  // Auto logout on token expiry
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = '/index.html';
    return { ok: false, status: 401, data: { error: 'Session expired' } };
  }

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
// Show alert helper
export function showAlert(id, message, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `alert alert-${type} show`;
  setTimeout(() => el.classList.remove('show'), 4000);
}
