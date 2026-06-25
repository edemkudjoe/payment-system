import { requireAuth, logout, apiFetch, showAlert, getSession } from './auth.js';

const staff = requireAuth(['admin', 'manager']);
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

// --- Summary ---
async function loadSummary() {
  const { ok, data } = await apiFetch(`/events/${event_id}/summary`);
  if (!ok) return;

  document.getElementById('statToppedUp').textContent = `₵${data.total_topped_up}`;
  document.getElementById('statSpent').textContent = `₵${data.total_spent}`;
  document.getElementById('statRefunded').textContent = `₵${data.total_refunded}`;
  document.getElementById('statDonated').textContent = `₵${data.total_donated}`;
  document.getElementById('statRemaining').textContent = `₵${data.total_remaining_balance}`;
  document.getElementById('statAttendees').textContent = data.total_attendees;

  const tbody = document.getElementById('vendorBreakdown');
  tbody.innerHTML = data.vendor_breakdown.length
    ? data.vendor_breakdown.map(v => `
        <tr>
          <td>${v.name}</td>
          <td>₵${v.total_received}</td>
          <td>₵${v.token_balance}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="text-muted">No vendors yet</td></tr>';
}

// --- Transactions ---
async function loadTransactions() {
  const type = document.getElementById('filterType').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;

  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (from) params.append('from', from);
  if (to) params.append('to', to);

  const { ok, data } = await apiFetch(`/events/${event_id}/transactions?${params}`);
  const tbody = document.getElementById('transactionLog');

  if (!ok) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Failed to load</td></tr>';
    return;
  }

  const typeBadge = {
    top_up: 'badge-blue',
    payment: 'badge-green',
    refund: 'badge-gray',
    donation: 'badge-red'
  };

  tbody.innerHTML = data.length
    ? data.map(tx => `
        <tr>
          <td><span class="badge ${typeBadge[tx.transaction_type] || 'badge-gray'}">${tx.transaction_type}</span></td>
          <td>₵${tx.amount}</td>
          <td>${tx.attendees?.name || tx.attendees?.qr_code_id || '—'}</td>
          <td>${tx.vendors?.name || '—'}</td>
          <td>${tx.staff?.name || '—'}</td>
          <td>${new Date(tx.created_at).toLocaleString()}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">No transactions found</td></tr>';
}

document.getElementById('filterBtn').addEventListener('click', loadTransactions);

// --- Vendors ---
async function loadVendors() {
  const { ok, data } = await apiFetch(`/events/${event_id}`);
  if (!ok) return;

  const tbody = document.getElementById('vendorList');
  tbody.innerHTML = data.vendors.length
    ? data.vendors.map(v => `
        <tr>
          <td>${v.name}</td>
          <td>${v.description || '—'}</td>
          <td>₵${v.balance}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="text-muted">No vendors yet</td></tr>';
}

document.getElementById('addVendorBtn').addEventListener('click', async () => {
  const name = document.getElementById('vendorName').value.trim();
  const description = document.getElementById('vendorDesc').value.trim();

  if (!name) return showAlert('vendorAlert', 'Vendor name is required.');

  const btn = document.getElementById('addVendorBtn');
  btn.disabled = true;

  const { ok, data } = await apiFetch('/vendors', {
    method: 'POST',
    body: { name, description }
  });

  btn.disabled = false;

  if (!ok) return showAlert('vendorAlert', data.error || 'Failed to add vendor.');

  showAlert('vendorAlert', 'Vendor added successfully.', 'success');
  document.getElementById('vendorName').value = '';
  document.getElementById('vendorDesc').value = '';
  loadVendors();
});

// --- Staff ---
async function loadStaff() {
  const { ok, data } = await apiFetch(`/events/${event_id}`);
  if (!ok) return;

  const tbody = document.getElementById('staffList');
  tbody.innerHTML = data.staff.length
    ? data.staff.map(s => `
        <tr>
          <td>${s.name}</td>
          <td>${s.username}</td>
          <td><span class="badge badge-blue">${s.role}</span></td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="text-muted">No staff yet</td></tr>';
}

document.getElementById('addStaffBtn').addEventListener('click', async () => {
  const name = document.getElementById('staffNameInput').value.trim();
  const username = document.getElementById('staffUsername').value.trim();
  const role = document.getElementById('staffRole').value;
  const pin = document.getElementById('staffPin').value.trim();

  if (!name || !username || !pin) {
    return showAlert('staffAlert', 'Name, username and PIN are required.');
  }

  const btn = document.getElementById('addStaffBtn');
  btn.disabled = true;

  const { ok, data } = await apiFetch(`/events/${event_id}/staff`, {
    method: 'POST',
    body: { name, username, role, pin }
  });

  btn.disabled = false;

  if (!ok) return showAlert('staffAlert', data.error || 'Failed to add staff.');

  showAlert('staffAlert', 'Staff added successfully.', 'success');
  document.getElementById('staffNameInput').value = '';
  document.getElementById('staffUsername').value = '';
  document.getElementById('staffPin').value = '';
  loadStaff();
});

// --- Init ---
loadSummary();
loadTransactions();
loadVendors();
loadStaff();