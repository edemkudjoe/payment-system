import { requireAuth, logout, apiFetch, showAlert, getSession } from './auth.js';

const staff = requireAuth(['cashier', 'admin']);
if (staff) {
  document.getElementById('staffName').textContent = `${staff.name} (${staff.role})`;
}

document.getElementById('logoutBtn').addEventListener('click', logout);

const { event_id } = getSession();

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.className = 'btn btn-outline w-auto tab-btn';
    });
    btn.className = 'btn btn-primary w-auto tab-btn';
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
  });
});

// --- Register Attendee ---
document.getElementById('registerBtn').addEventListener('click', async () => {
  const name = document.getElementById('attendeeName').value.trim();
  const btn = document.getElementById('registerBtn');

  btn.disabled = true;
  btn.textContent = 'Registering...';

  const { ok, data } = await apiFetch('/attendees', {
    method: 'POST',
    body: { name }
  });

  btn.disabled = false;
  btn.textContent = 'Register & Generate QR';

  if (!ok) return showAlert('registerAlert', data.error || 'Registration failed.');

  document.getElementById('qrImage').src = data.qr_code_image;
  document.getElementById('qrCodeId').textContent = `ID: ${data.qr_code_id}`;
  document.getElementById('qrResult').style.display = 'block';
  document.getElementById('attendeeName').value = '';

  showAlert('registerAlert', 'Attendee registered successfully.', 'success');
});

document.getElementById('printBtn').addEventListener('click', () => {
  const img = document.getElementById('qrImage').src;
  const id = document.getElementById('qrCodeId').textContent;
  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <body style="text-align:center; font-family: system-ui; padding: 2rem;">
        <h2>Event Payment Card</h2>
        <img src="${img}" style="width:220px; height:220px;" />
        <p style="font-size:0.85rem; color:#555; margin-top:0.5rem;">${id}</p>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
});

// --- Top Up ---
let topupAttendeeId = null;

document.getElementById('lookupBtn').addEventListener('click', async () => {
  const qr_code_id = document.getElementById('topupQrId').value.trim();
  if (!qr_code_id) return showAlert('topupAlert', 'Enter a QR code ID.');

  const { ok, data } = await apiFetch(`/attendees/qr/${qr_code_id}`);

  if (!ok) return showAlert('topupAlert', data.error || 'Attendee not found.');

  topupAttendeeId = data.id;
  document.getElementById('topupAttendeeName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('topupAttendeeId').textContent = `ID: ${data.id}`;
  document.getElementById('topupBalance').textContent = `₵${data.balance}`;
  document.getElementById('topupAttendeeInfo').style.display = 'block';
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
  showAlert('topupAlert', `₵${amount} topped up successfully.`, 'success');
});

// --- Refund / Donate ---
let exitAttendeeId = null;

document.getElementById('exitLookupBtn').addEventListener('click', async () => {
  const qr_code_id = document.getElementById('exitQrId').value.trim();
  if (!qr_code_id) return showAlert('exitAlert', 'Enter a QR code ID.');

  const { ok, data } = await apiFetch(`/attendees/${qr_code_id}`);

  if (!ok) return showAlert('exitAlert', data.error || 'Attendee not found.');

  exitAttendeeId = data.id;
  document.getElementById('exitAttendeeName').textContent = data.name || 'Unnamed Attendee';
  document.getElementById('exitAttendeeIdDisplay').textContent = `ID: ${data.id}`;
  document.getElementById('exitBalance').textContent = `₵${data.balance}`;
  document.getElementById('exitAttendeeInfo').style.display = 'block';
});

async function processExit(type) {
  if (!exitAttendeeId) return showAlert('exitAlert', 'Look up an attendee first.');

  const balance = document.getElementById('exitBalance').textContent;
  if (balance === '₵0') return showAlert('exitAlert', 'No tokens to process.');

  const action = type === 'refund' ? 'refund' : 'donate';
  const confirmed = confirm(`Are you sure you want to ${action} all tokens?`);
  if (!confirmed) return;

  const { ok, data } = await apiFetch(`/attendees/${exitAttendeeId}/${action}`, {
    method: 'POST'
  });

  if (!ok) return showAlert('exitAlert', data.error || `${action} failed.`);

  document.getElementById('exitBalance').textContent = '₵0';
  document.getElementById('exitAttendeeInfo').style.display = 'none';
  document.getElementById('exitQrId').value = '';
  exitAttendeeId = null;

  showAlert('exitAlert', `${data.amount} tokens ${action}ed successfully.`, 'success');
}

document.getElementById('refundBtn').addEventListener('click', () => processExit('refund'));
document.getElementById('donateBtn').addEventListener('click', () => processExit('donate'));