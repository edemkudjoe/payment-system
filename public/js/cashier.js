import { requireAuth, logout, apiFetch, showAlert, getSession } from './auth.js';

const staff = requireAuth(['cashier', 'admin']);
if (staff) {
  document.getElementById('staffName').textContent = `${staff.name} (${staff.role})`;
}

document.getElementById('logoutBtn').addEventListener('click', logout);

const { event_id } = getSession();


// --- Scanners ---
let topupScanner = null;
let exitScanner = null;

function initScanner(elementId, onScan) {
  const scanner = new Html5Qrcode(elementId);
  scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      scanner.pause();
      onScan(decodedText);
    },
    () => {}
  ).catch(() => {
    document.getElementById(elementId).style.display = 'none';
  });
  return scanner;
}

// Init scanners when tabs are clicked
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.className = 'btn btn-outline w-auto tab-btn';
    });
    btn.className = 'btn btn-primary w-auto tab-btn';
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';

    if (btn.dataset.tab === 'register' && !activateScanner) {
  activateScanner = initScanner('activateQrScanner', (decodedText) => {
    document.getElementById('activateQrId').value = decodedText;
    if (activateScanner) activateScanner.pause();
  });
}
    // Start scanner for the active tab
    if (btn.dataset.tab === 'topup' && !topupScanner) {
      topupScanner = initScanner('topupQrScanner', (decodedText) => {
        document.getElementById('topupQrId').value = decodedText;
        lookupTopupAttendee(decodedText);
      });
    }

    if (btn.dataset.tab === 'exit' && !exitScanner) {
      exitScanner = initScanner('exitQrScanner', (decodedText) => {
        document.getElementById('exitQrId').value = decodedText;
        lookupExitAttendee(decodedText);
      });
    }
  });
});

// --- Activate Card ---
let activateScanner = null;




document.getElementById('activateBtn').addEventListener('click', async () => {
  const qr_code_id = document.getElementById('activateQrId').value.trim();
  const name = document.getElementById('attendeeName').value.trim();

  if (!qr_code_id) return showAlert('registerAlert', 'Scan or enter a QR code ID.');

  const btn = document.getElementById('activateBtn');
  btn.disabled = true;
  btn.textContent = 'Activating...';

  const { ok, data } = await apiFetch('/attendees/activate', {
    method: 'POST',
    body: { qr_code_id, name }
  });

  btn.disabled = false;
  btn.textContent = 'Activate Card';

  if (!ok) {
    if (activateScanner) activateScanner.resume();
    return showAlert('registerAlert', data.error || 'Activation failed.');
  }

  document.getElementById('activateDetails').textContent =
    `${data.attendee.name || 'Unnamed'} · Balance: ₵${data.attendee.balance}`;
  document.getElementById('activateResult').style.display = 'block';
  document.getElementById('activateQrId').value = '';
  document.getElementById('attendeeName').value = '';

  setTimeout(() => {
    document.getElementById('activateResult').style.display = 'none';
    if (activateScanner) activateScanner.resume();
  }, 3000);
});

// --- Top Up ---
let topupAttendeeId = null;

async function lookupTopupAttendee(qr_code_id) {
  const { ok, data } = await apiFetch(`/attendees/qr/${qr_code_id}`);
  if (!ok) return showAlert('topupAlert', data.error || 'Attendee not found.');

  topupAttendeeId = data.id;
  document.getElementById('topupAttendeeName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('topupAttendeeId').textContent = `ID: ${data.id}`;
  document.getElementById('topupBalance').textContent = `₵${data.balance}`;
  document.getElementById('topupAttendeeInfo').style.display = 'block';
}

document.getElementById('lookupBtn').addEventListener('click', () => {
  const qr_code_id = document.getElementById('topupQrId').value.trim();
  if (!qr_code_id) return showAlert('topupAlert', 'Enter a QR code ID.');
  lookupTopupAttendee(qr_code_id);
});

document.getElementById('topupBtn').addEventListener('click', async () => {
  const amount = parseInt(document.getElementById('topupAmount').value);
  if (!amount || amount <= 0) return showAlert('topupAlert', 'Enter a valid amount.');
  if (!topupAttendeeId) return showAlert('topupAlert', 'Look up an attendee first.');

  const btn = document.getElementById('topupBtn');
  btn.disabled = true;
  btn.textContent = 'Processing...';

  const { ok, data } = await apiFetch(`/attendees/${topupAttendeeId}/topup`, {
    method: 'POST',
    body: { amount }
  });

  btn.disabled = false;
  btn.textContent = 'Top Up';

  if (!ok) return showAlert('topupAlert', data.error || 'Top up failed.');

  document.getElementById('topupBalance').textContent = `₵${data.new_balance}`;
  document.getElementById('topupAmount').value = '';
  if (topupScanner) topupScanner.resume();
  showAlert('topupAlert', `₵${amount} topped up successfully.`, 'success');
});

// --- Refund / Donate ---
let exitAttendeeId = null;

async function lookupExitAttendee(qr_code_id) {
  const { ok, data } = await apiFetch(`/attendees/qr/${qr_code_id}`);
  if (!ok) return showAlert('exitAlert', data.error || 'Attendee not found.');

  exitAttendeeId = data.id;
  document.getElementById('exitAttendeeName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('exitAttendeeIdDisplay').textContent = `ID: ${data.id}`;
  document.getElementById('exitBalance').textContent = `₵${data.balance}`;
  document.getElementById('exitAttendeeInfo').style.display = 'block';
}

document.getElementById('exitLookupBtn').addEventListener('click', () => {
  const qr_code_id = document.getElementById('exitQrId').value.trim();
  if (!qr_code_id) return showAlert('exitAlert', 'Enter a QR code ID.');
  lookupExitAttendee(qr_code_id);
});

async function processExit(type) {
  if (!exitAttendeeId) return showAlert('exitAlert', 'Look up an attendee first.');

  const balance = document.getElementById('exitBalance').textContent;
  if (balance === '₵0') return showAlert('exitAlert', 'No tokens to process.');

  const confirmed = confirm(`Are you sure you want to ${type} all tokens?`);
  if (!confirmed) return;

  const { ok, data } = await apiFetch(`/attendees/${exitAttendeeId}/${type}`, {
    method: 'POST'
  });

  if (!ok) return showAlert('exitAlert', data.error || `${type} failed.`);

  document.getElementById('exitBalance').textContent = '₵0';
  document.getElementById('exitAttendeeInfo').style.display = 'none';
  document.getElementById('exitQrId').value = '';
  exitAttendeeId = null;
  if (exitScanner) exitScanner.resume();

  showAlert('exitAlert', `${data.amount} tokens ${type}ed successfully.`, 'success');
}

document.getElementById('refundBtn').addEventListener('click', () => processExit('refund'));
document.getElementById('donateBtn').addEventListener('click', () => processExit('donate'));
