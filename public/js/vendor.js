import { showAlert } from './auth.js';

const API_BASE = '/api';

let vendorSession = null;
let html5QrCode = null;

// --- Vendor uses its own session separate from staff session ---
function saveVendorSession(vendor, event_id) {
  sessionStorage.setItem('vendor', JSON.stringify(vendor));
  sessionStorage.setItem('vendor_event_id', event_id);
}

function getVendorSession() {
  const vendor = JSON.parse(sessionStorage.getItem('vendor') || 'null');
  const event_id = sessionStorage.getItem('vendor_event_id');
  return { vendor, event_id };
}

function clearVendorSession() {
  sessionStorage.removeItem('vendor');
  sessionStorage.removeItem('vendor_event_id');
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// --- Restore session on page load ---
const { vendor, event_id } = getVendorSession();
if (vendor && event_id) {
  vendorSession = { vendor, event_id };
  showDashboard();
}

// --- Vendor Login ---
// Vendors log in with event_code + vendor_id (no PIN needed)
// We fetch vendor details and store them in sessionStorage
document.getElementById('vendorLoginBtn').addEventListener('click', async () => {
  const event_code = document.getElementById('eventCode').value.trim();
  const vendor_code = document.getElementById('vendorCode').value.trim().toUpperCase();
  const pin = document.getElementById('vendorPin').value.trim();

  if (!event_code || !vendor_code || !pin) {
    return showAlert('loginAlert', 'Event code, vendor code and PIN are required.');
  }

  const btn = document.getElementById('vendorLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { ok, data } = await apiFetch(`/vendors/login`, {
    method: 'POST',
    body: { event_code, vendor_code, pin }
  });

  btn.disabled = false;
  btn.textContent = 'Sign In';

  if (!ok) return showAlert('loginAlert', data.error || 'Login failed.');

  vendorSession = { vendor: data.vendor, event_id: data.event_id };
  saveVendorSession(data.vendor, data.event_id);
  showDashboard();
});
// --- Dashboard ---
function showDashboard() {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';
  document.getElementById('vendorName').textContent = vendorSession.vendor.name;
  loadBalance();
  initScanner();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearVendorSession();
  if (html5QrCode) html5QrCode.stop().catch(() => {});
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('vendorName').textContent = '';
});

// --- Balance ---
async function loadBalance() {
  const { ok, data } = await apiFetch(`/vendors/${vendorSession.vendor.id}/balance`);
  if (!ok) return;
  document.getElementById('currentBalance').textContent = `₵${data.balance}`;
}

// --- Menu ---
let menuItems = [];
let cart = [];

async function loadMenu() {
  const { ok, data } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/menu?event_id=${vendorSession.event_id}`
  );
  if (!ok) return;
  menuItems = data;
  renderMenu();
}

function renderMenu() {
  const container = document.getElementById('menuList');
  if (!menuItems.length) {
    container.innerHTML = '<div class="text-muted" style="font-size: 0.875rem;">No items yet</div>';
    return;
  }

  container.innerHTML = menuItems.map(item => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.625rem 0.75rem; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border);">
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <button
          class="btn w-auto"
          style="padding: 0.2rem 0.6rem; font-size: 0.75rem; background: ${item.is_available ? '#dcfce7' : '#f3f4f6'}; color: ${item.is_available ? 'var(--success)' : 'var(--muted)'}; border: none;"
          onclick="toggleMenuItem('${item.id}')"
        >${item.is_available ? 'Available' : 'Unavailable'}</button>
        <span style="font-weight: 500;">${item.name}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <span style="font-weight: 600;">₵${item.price}</span>
        <button
          class="btn btn-primary w-auto"
          style="padding: 0.2rem 0.75rem; font-size: 0.8rem;"
          onclick="addToCart('${item.id}')"
          ${!item.is_available ? 'disabled' : ''}
        >+ Add</button>
        <button
          class="btn btn-danger w-auto"
          style="padding: 0.2rem 0.6rem; font-size: 0.8rem;"
          onclick="deleteMenuItem('${item.id}')"
        >✕</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('addMenuItemBtn').addEventListener('click', async () => {
  const name = document.getElementById('menuItemName').value.trim();
  const price = parseInt(document.getElementById('menuItemPrice').value);

  if (!name || !price || price <= 0) {
    return showAlert('menuAlert', 'Item name and a valid price are required.');
  }

  const { ok, data } = await apiFetch(`/vendors/${vendorSession.vendor.id}/menu`, {
    method: 'POST',
    body: { name, price, event_id: vendorSession.event_id }
  });

  if (!ok) return showAlert('menuAlert', data.error || 'Failed to add item.');

  document.getElementById('menuItemName').value = '';
  document.getElementById('menuItemPrice').value = '';
  menuItems.push(data);
  renderMenu();
});

window.toggleMenuItem = async (item_id) => {
  const { ok, data } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/menu/${item_id}/toggle`,
    { method: 'POST', body: { event_id: vendorSession.event_id } }
  );
  if (!ok) return;
  menuItems = menuItems.map(i => i.id === item_id ? data : i);
  renderMenu();
};

window.deleteMenuItem = async (item_id) => {
  const confirmed = confirm('Remove this item from the menu?');
  if (!confirmed) return;

  const { ok } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/menu/${item_id}?event_id=${vendorSession.event_id}`,
    { method: 'DELETE' }
  );
  if (!ok) return;

  menuItems = menuItems.filter(i => i.id !== item_id);
  cart = cart.filter(i => i.menu_item_id !== item_id);
  renderMenu();
  renderCart();
};

// --- Cart ---
window.addToCart = (item_id) => {
  const item = menuItems.find(i => i.id === item_id);
  if (!item) return;

  const existing = cart.find(i => i.menu_item_id === item_id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ menu_item_id: item_id, name: item.name, price: item.price, quantity: 1 });
  }
  renderCart();
};

function renderCart() {
  const section = document.getElementById('cartSection');
  const container = document.getElementById('cartItems');

  if (!cart.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';

  container.innerHTML = cart.map((item, index) => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border);">
      <span style="font-weight: 500;">${item.name}</span>
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <button class="btn btn-outline w-auto" style="padding: 0.1rem 0.5rem; font-size: 0.9rem;" onclick="updateCartQty(${index}, -1)">−</button>
          <span style="min-width: 1.5rem; text-align: center;">${item.quantity}</span>
          <button class="btn btn-outline w-auto" style="padding: 0.1rem 0.5rem; font-size: 0.9rem;" onclick="updateCartQty(${index}, 1)">+</button>
        </div>
        <span style="font-weight: 600; min-width: 3rem; text-align: right;">₵${item.price * item.quantity}</span>
        <button class="btn btn-danger w-auto" style="padding: 0.2rem 0.6rem; font-size: 0.8rem;" onclick="removeFromCart(${index})">✕</button>
      </div>
    </div>
  `).join('');

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  document.getElementById('cartTotal').textContent = `₵${total}`;
}

window.updateCartQty = (index, delta) => {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  renderCart();
};

window.removeFromCart = (index) => {
  cart.splice(index, 1);
  renderCart();
};

document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = [];
  renderCart();
});

document.getElementById('refreshBalance').addEventListener('click', loadBalance);

// --- QR Scanner ---
function initScanner() {
  html5QrCode = new Html5Qrcode('qrScanner');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      document.getElementById('chargeQrId').value = decodedText;
      html5QrCode.pause();
      lookupAttendee(decodedText);
    },
    () => {} // ignore scan errors
  ).catch(() => {
    // Camera not available — manual entry only
    document.getElementById('qrScanner').style.display = 'none';
  });
}

// --- Attendee Lookup ---
async function lookupAttendee(qr_code_id) {
  const { ok, data } = await apiFetch(`/attendees/${qr_code_id}`);

  if (!ok) {
    showAlert('chargeAlert', data.error || 'Attendee not found.');
    document.getElementById('attendeePreview').style.display = 'none';
    if (html5QrCode) html5QrCode.resume();
    return;
  }

  document.getElementById('previewName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('previewBalance').textContent = `₵${data.balance}`;
  document.getElementById('attendeePreview').style.display = 'block';
}

document.getElementById('chargeQrId').addEventListener('change', (e) => {
  const val = e.target.value.trim();
  if (val) lookupAttendee(val);
});

// --- Charge ---
document.getElementById('chargeBtn').addEventListener('click', async () => {
  const qr_code_id = document.getElementById('chargeQrId').value.trim();
  const amount = parseInt(document.getElementById('chargeAmount').value);

  if (!qr_code_id) return showAlert('chargeAlert', 'Scan or enter a QR code ID.');
  if (!amount || amount <= 0) return showAlert('chargeAlert', 'Enter a valid amount.');

  const btn = document.getElementById('chargeBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const { ok, data } = await apiFetch(`/vendors/${vendorSession.vendor.id}/charge`, {
  method: 'POST',
  body: { qr_code_id, amount, event_id: vendorSession.event_id }
    });

  btn.disabled = false;
  btn.textContent = 'Charge';

  if (!ok) {
    showAlert('chargeAlert', data.error || 'Charge failed.');
    if (html5QrCode) html5QrCode.resume();
    return;
  }

  // Show receipt
  document.getElementById('receiptDetails').textContent =
    `₵${amount} charged · Attendee balance: ₵${data.attendee_new_balance}`;
  document.getElementById('chargeReceipt').style.display = 'block';
  document.getElementById('currentBalance').textContent = `₵${data.vendor_new_balance}`;

  // Reset for next transaction
  setTimeout(() => {
    document.getElementById('chargeQrId').value = '';
    document.getElementById('chargeAmount').value = '';
    document.getElementById('attendeePreview').style.display = 'none';
    document.getElementById('chargeReceipt').style.display = 'none';
    if (html5QrCode) html5QrCode.resume();
  }, 3000);
});
