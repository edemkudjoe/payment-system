import { showAlert } from './auth.js';

const API_BASE = '/api';

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

document.getElementById('checkBtn').addEventListener('click', checkBalance);

document.getElementById('qrCodeId').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkBalance();
});

async function checkBalance() {
  const qr_code_id = document.getElementById('qrCodeId').value.trim();

  if (!qr_code_id) {
    return showAlert('lookupAlert', 'Please enter your card ID.');
  }

  const btn = document.getElementById('checkBtn');
  btn.disabled = true;
  btn.textContent = 'Checking...';

  const { ok, data } = await apiFetch(`/attendees/qr/${qr_code_id}`);

  btn.disabled = false;
  btn.textContent = 'Check Balance';

  if (!ok) {
    document.getElementById('balanceResult').style.display = 'none';
    return showAlert('lookupAlert', data.error || 'Card not found.');
  }

  document.getElementById('balanceDisplay').textContent = `₵${data.balance}`;
  document.getElementById('attendeeNameDisplay').textContent = data.name || '';
  document.getElementById('balanceResult').style.display = 'block';
}