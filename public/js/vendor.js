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
  const vendor_id = document.getElementById('vendorId').value.trim();

  if (!event_code || !vendor_id) {
    return showAlert('loginAlert', 'Event code and vendor ID are required.');
  }

  const btn = document.getElementById('vendorLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  const { ok, data } = await apiFetch(`/vendors/login`, {
    method: 'POST',
    body: { event_code, vendor_id }
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