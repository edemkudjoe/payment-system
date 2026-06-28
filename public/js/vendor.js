import { showAlert } from './auth.js';

const API_BASE = '/api';

let vendorSession = null;
let html5QrCode = null;
let menuItems = [];
let cart = [];
let currentAttendee = null;

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

// --- Restore session ---
const { vendor, event_id } = getVendorSession();
if (vendor && event_id) {
  vendorSession = { vendor, event_id };
  showDashboard();
}

// --- Login ---
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

  const { ok, data } = await apiFetch('/vendors/login', {
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
  loadMenu();
  showSellMode();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  clearVendorSession();
  if (html5QrCode) html5QrCode.stop().catch(() => {});
  document.getElementById('loginSection').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
  document.getElementById('vendorName').textContent = '';
});

// --- Mode Toggle ---
document.getElementById('setupModeBtn').addEventListener('click', () => {
  document.getElementById('setupMode').style.display = 'block';
  document.getElementById('sellMode').style.display = 'none';
  document.getElementById('setupModeBtn').className = 'btn btn-primary w-auto';
  document.getElementById('sellModeBtn').className = 'btn btn-outline w-auto';
  if (html5QrCode) html5QrCode.stop().catch(() => {});
});

document.getElementById('sellModeBtn').addEventListener('click', () => {
  showSellMode();
});

function showSellMode() {
  document.getElementById('setupMode').style.display = 'none';
  document.getElementById('sellMode').style.display = 'block';
  document.getElementById('sellModeBtn').className = 'btn btn-primary w-auto';
  document.getElementById('setupModeBtn').className = 'btn btn-outline w-auto';
  goToStage(1);
}

// --- Balance ---
async function loadBalance() {
  const { ok, data } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/balance?event_id=${vendorSession.event_id}`
  );
  if (!ok) return;
  document.getElementById('currentBalance').textContent = `₵${data.balance}`;
}

// --- Stages ---
function goToStage(n) {
  document.querySelectorAll('.stage').forEach(s => s.classList.remove('active'));
  document.getElementById(`stage${n}`).classList.add('active');

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`dot${i}`);
    dot.className = 'stage-dot';
    if (i < n) dot.classList.add('done');
    else if (i === n) dot.classList.add('active');
  }

  for (let i = 1; i <= 2; i++) {
    const line = document.getElementById(`line${i}`);
    line.className = 'stage-line';
    if (i < n) line.classList.add('done');
  }

  if (n === 2) {
    initScanner();
  } else {
    if (html5QrCode && scannerStarted) {
      try { html5QrCode.pause(); } catch { /* ignore */ }
    }
  }
}
// --- Menu ---
async function loadMenu() {
  const { ok, data } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/menu?event_id=${vendorSession.event_id}`
  );
  if (!ok) return;
  menuItems = data;
  renderMenu();
  renderMenuGrid();
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
          class="btn btn-danger w-auto"
          style="padding: 0.2rem 0.6rem; font-size: 0.8rem;"
          onclick="deleteMenuItem('${item.id}')"
        >✕</button>
      </div>
    </div>
  `).join('');
}

function renderMenuGrid() {
  const grid = document.getElementById('menuGrid');
  const available = menuItems.filter(i => i.is_available);

  if (!available.length) {
    grid.innerHTML = '<div class="text-muted" style="font-size: 0.875rem; grid-column: span 2;">No available items. Go to Setup to add menu items.</div>';
    return;
  }

  grid.innerHTML = available.map(item => `
    <button class="menu-item-btn" onclick="addToCart('${item.id}')">
      <div class="menu-item-name">${item.name}</div>
      <div class="menu-item-price">₵${item.price}</div>
    </button>
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
  renderMenuGrid();
});

window.toggleMenuItem = async (item_id) => {
  const { ok, data } = await apiFetch(
    `/vendors/${vendorSession.vendor.id}/menu/${item_id}/toggle`,
    { method: 'POST', body: { event_id: vendorSession.event_id } }
  );
  if (!ok) return;
  menuItems = menuItems.map(i => i.id === item_id ? data : i);
  renderMenu();
  renderMenuGrid();
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
  renderMenuGrid();
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
  const summary = document.getElementById('cartSummary');
  const emptyMsg = document.getElementById('emptyCartMsg');
  const itemsContainer = document.getElementById('cartSummaryItems');

  if (!cart.length) {
    summary.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }

  summary.style.display = 'block';
  emptyMsg.style.display = 'none';

  itemsContainer.innerHTML = cart.map((item, index) => `
    <div class="cart-summary-row">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <button class="btn btn-outline w-auto" style="padding: 0.1rem 0.4rem; font-size: 0.8rem;" onclick="updateCartQty(${index}, -1)">−</button>
        <span>${item.name} x${item.quantity}</span>
        <button class="btn btn-outline w-auto" style="padding: 0.1rem 0.4rem; font-size: 0.8rem;" onclick="updateCartQty(${index}, 1)">+</button>
      </div>
      <span style="font-weight: 600;">₵${item.price * item.quantity}</span>
    </div>
  `).join('');

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  document.getElementById('cartTotalDisplay').textContent = `₵${total}`;
}

window.updateCartQty = (index, delta) => {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  renderCart();
};

document.getElementById('clearCartBtn').addEventListener('click', () => {
  cart = [];
  renderCart();
});

document.getElementById('proceedToScanBtn').addEventListener('click', () => {
  if (!cart.length) return;

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  // Force DOM query at click time
  const stage2Summary = document.querySelector('#stage2CartSummary');
  const chargeBtnAmount = document.querySelector('#chargeBtnAmount');
  const chargeBtn = document.querySelector('#chargeBtn');
  const attendeePreview = document.querySelector('#attendeePreview');
  const chargeQrId = document.querySelector('#chargeQrId');

  console.log('stage2Summary:', stage2Summary);
  console.log('chargeBtnAmount:', chargeBtnAmount);
  console.log('chargeBtn:', chargeBtn);

  if (!stage2Summary || !chargeBtnAmount || !chargeBtn) {
    console.error('Missing element');
    return;
  }

  stage2Summary.innerHTML = `
    ${cart.map(i => `
      <div class="cart-summary-row">
        <span>${i.name} x${i.quantity}</span>
        <span style="font-weight: 600;">₵${i.price * i.quantity}</span>
      </div>
    `).join('')}
    <div class="cart-total-row">
      <span>Total</span>
      <span>₵${total}</span>
    </div>
  `;

  chargeBtnAmount.textContent = `₵${total}`;
  chargeBtn.style.display = 'none';
  attendeePreview.style.display = 'none';
  chargeQrId.value = '';
  currentAttendee = null;

  goToStage(2);
});

document.getElementById('backToCartBtn').addEventListener('click', () => {
  goToStage(1);
});

// --- Scanner ---
// --- Scanner ---
let scannerStarted = false;

function initScanner() {
  if (scannerStarted) {
    try {
      html5QrCode.resume();
    } catch {
      restartScanner();
    }
    return;
  }

  html5QrCode = new Html5Qrcode('qrScanner');
  startScanner();
}

function startScanner() {
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      document.getElementById('chargeQrId').value = decodedText;
      html5QrCode.pause();
      lookupAttendee(decodedText);
    },
    () => {}
  ).then(() => {
    scannerStarted = true;
  }).catch(() => {
    document.getElementById('qrScanner').style.display = 'none';
  });
}

function restartScanner() {
  scannerStarted = false;
  html5QrCode.stop().catch(() => {}).finally(() => {
    html5QrCode = new Html5Qrcode('qrScanner');
    startScanner();
  });
}
// --- Attendee Lookup ---
async function lookupAttendee(qr_code_id) {
  const { ok, data } = await apiFetch(`/attendees/qr/${qr_code_id}`);

  if (!ok) {
    showAlert('chargeAlert', data.error || 'Attendee not found.');
    document.getElementById('attendeePreview').style.display = 'none';
    document.getElementById('chargeBtn').style.display = 'none';
    if (html5QrCode) html5QrCode.resume();
    return;
  }

  currentAttendee = { ...data, qr_code_id };
  document.getElementById('previewName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('previewBalance').textContent = `₵${data.balance}`;
  document.getElementById('attendeePreview').style.display = 'block';
  document.getElementById('chargeBtn').style.display = 'block';
}
// --- Charge ---
document.getElementById('chargeBtn').addEventListener('click', async () => {
  if (!currentAttendee) return showAlert('chargeAlert', 'Scan an attendee card first.');
  if (!cart.length) return showAlert('chargeAlert', 'Cart is empty.');

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const btn = document.getElementById('chargeBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const { ok, data } = await apiFetch(`/vendors/${vendorSession.vendor.id}/charge`, {
  method: 'POST',
  body: {
    qr_code_id: currentAttendee.qr_code_id,
    amount: total,
    event_id: vendorSession.event_id
  }
});
  btn.disabled = false;
  btn.textContent = `Charge ₵${total}`;

  if (!ok) {
    showAlert('chargeAlert', data.error || 'Charge failed.');
    if (html5QrCode) html5QrCode.resume();
    return;
  }

  // Update balance
  document.getElementById('currentBalance').textContent = `₵${data.vendor_new_balance}`;

  // Populate receipt
  document.getElementById('receiptAmount').textContent = `₵${total}`;
  document.getElementById('receiptItems').textContent = cart.map(i => `${i.name} x${i.quantity}`).join(' · ');
  document.getElementById('receiptAttendeeName').textContent = currentAttendee.name || 'Unnamed';
  document.getElementById('receiptAttendeeBalance').textContent = `₵${data.attendee_new_balance}`;
  document.getElementById('receiptVendorBalance').textContent = `₵${data.vendor_new_balance}`;

  goToStage(3);
});

// --- New Sale ---
document.getElementById('newSaleBtn').addEventListener('click', () => {
  cart = [];
  currentAttendee = null;
  renderCart();
  document.getElementById('chargeQrId').value = '';
  document.getElementById('attendeePreview').style.display = 'none';
  document.getElementById('chargeBtn').style.display = 'none';
  goToStage(1);
});
