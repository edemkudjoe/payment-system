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

// --- Real-time Summary ---
function initRealtime() {
  const client = window.supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
  );

  client
    .channel('admin-summary')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'transactions',
        filter: `event_id=eq.${event_id}`
      },
      () => {
        loadSummary();
        loadTransactions();
      }
    )
    .subscribe();
}

// --- Transactions ---
// --- Transactions ---
async function loadTransactions() {
  const type = document.getElementById('filterType').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const vendor_id = document.getElementById('filterVendor').value;
  const attendee_qr = document.getElementById('filterAttendee').value.trim();

  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (vendor_id) params.append('vendor_id', vendor_id);
  if (attendee_qr) params.append('attendee_qr', attendee_qr);

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

document.getElementById('exportBtn').addEventListener('click', () => {
  const { token } = getSession();

  const type = document.getElementById('filterType').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const vendor_id = document.getElementById('filterVendor').value;
  const attendee_qr = document.getElementById('filterAttendee').value.trim();

  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  if (vendor_id) params.append('vendor_id', vendor_id);
  if (attendee_qr) params.append('attendee_qr', attendee_qr);

  fetch(`/api/events/${event_id}/export?${params}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then(res => {
      if (!res.ok) throw new Error('Export failed');
      return res.blob();
    })
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => showAlert('summaryAlert', 'Failed to export transactions.'));
});
// --- Vendors ---
async function loadVendors() {
  const { ok, data } = await apiFetch(`/events/${event_id}`);
  if (!ok) return;

  // Populate vendor filter dropdown
  const filterVendor = document.getElementById('filterVendor');
  filterVendor.innerHTML = '<option value="">All Vendors</option>' +
    data.vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');

  const tbody = document.getElementById('vendorList');
  tbody.innerHTML = data.vendors.length
    ? data.vendors.map(v => `
        <tr>
          <td>${v.name}</td>
          <td><span class="badge badge-blue">${v.vendor_code || '—'}</span></td>
          <td>${v.description || '—'}</td>
          <td>₵${v.balance}</td>
          <td>
            <button class="btn btn-danger w-auto" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" onclick="deleteVendor('${v.id}', '${v.name}')">
              Delete
            </button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="text-muted">No vendors yet</td></tr>';
}
document.getElementById('addVendorBtn').addEventListener('click', async () => {
  const name = document.getElementById('vendorName').value.trim();
  const description = document.getElementById('vendorDesc').value.trim();
  const vendor_code = document.getElementById('vendorCode').value.trim().toUpperCase();
  const pin = document.getElementById('vendorPin').value.trim();

  if (!name || !vendor_code || !pin) {
    return showAlert('vendorAlert', 'Vendor name, code and PIN are required.');
  }

  const btn = document.getElementById('addVendorBtn');
  btn.disabled = true;

  const { ok, data } = await apiFetch('/vendors', {
    method: 'POST',
    body: { name, description, vendor_code, pin }
  });

  btn.disabled = false;

  if (!ok) return showAlert('vendorAlert', data.error || 'Failed to add vendor.');

  showAlert('vendorAlert', 'Vendor added successfully.', 'success');
  document.getElementById('vendorName').value = '';
  document.getElementById('vendorDesc').value = '';
  document.getElementById('vendorCode').value = '';
  document.getElementById('vendorPin').value = '';
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
          <td>
            <button class="btn btn-danger w-auto" style="padding: 0.3rem 0.75rem; font-size: 0.8rem;" onclick="deleteStaff('${s.id}', '${s.name}')">
              Delete
            </button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="text-muted">No staff yet</td></tr>';
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

// --- Cards ---
let generatedCards = [];

document.getElementById('generateBtn').addEventListener('click', async () => {
  const count = parseInt(document.getElementById('cardCount').value);

  if (!count || count < 1 || count > 500) {
    return showAlert('generateAlert', 'Enter a number between 1 and 500.');
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const { ok, data } = await apiFetch('/attendees/generate', {
    method: 'POST',
    body: { count }
  });

  btn.disabled = false;
  btn.textContent = 'Generate';

  if (!ok) return showAlert('generateAlert', data.error || 'Failed to generate cards.');

  generatedCards = data.cards;
  document.getElementById('generatedCount').textContent = `${data.count} cards generated`;
  document.getElementById('printSheet').style.display = 'block';

  const grid = document.getElementById('cardGrid');
  grid.innerHTML = data.cards.map(card => `
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; text-align: center;">
      <img src="${card.qr_code_image}" style="width: 120px; height: 120px;" />
      <div style="font-size: 0.7rem; color: var(--muted); margin-top: 0.5rem; word-break: break-all;">
        ${card.qr_code_id}
      </div>
    </div>
  `).join('');

  showAlert('generateAlert', `${data.count} cards generated successfully.`, 'success');
});

document.getElementById('printCardsBtn').addEventListener('click', () => {
  if (!generatedCards.length) return;

  const win = window.open('', '_blank');
  win.document.write(`
    <html>
      <head>
        <style>
          body { font-family: system-ui; margin: 0; padding: 1rem; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
          .card { border: 1px dashed #ccc; border-radius: 8px; padding: 1rem; text-align: center; page-break-inside: avoid; }
          .card img { width: 140px; height: 140px; }
          .card p { font-size: 0.65rem; color: #555; margin-top: 0.5rem; word-break: break-all; }
          .card h4 { font-size: 0.8rem; margin-bottom: 0.5rem; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="grid">
          ${generatedCards.map(card => `
            <div class="card">
              <h4>Event Payment Card</h4>
              <img src="${card.qr_code_image}" />
              <p>${card.qr_code_id}</p>
            </div>
          `).join('')}
        </div>
      </body>
    </html>
  `);
  win.document.close();
  win.print();
});

document.getElementById('disableBtn').addEventListener('click', async () => {
  const qr_code_id = document.getElementById('disableQrId').value.trim();
  if (!qr_code_id) return showAlert('disableAlert', 'Enter a QR code ID.');

  const { ok: lookupOk, data: lookupData } = await apiFetch(`/attendees/qr/${qr_code_id}`);
  if (!lookupOk) return showAlert('disableAlert', lookupData.error || 'Card not found.');

  const confirmed = confirm('Disable this card? This cannot be undone easily.');
  if (!confirmed) return;

  const { ok, data } = await apiFetch(`/attendees/${lookupData.id}/disable`, {
    method: 'POST'
  });

  if (!ok) return showAlert('disableAlert', data.error || 'Failed to disable card.');

  document.getElementById('disableQrId').value = '';
  showAlert('disableAlert', 'Card disabled successfully.', 'success');
});

// --- Delete Staff ---
window.deleteStaff = async (id, name) => {
  const confirmed = confirm(`Delete staff member "${name}"? This cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await apiFetch(`/staff/${id}`, { method: 'DELETE' });

  if (!ok) return showAlert('staffAlert', data.error || 'Failed to delete staff.');

  showAlert('staffAlert', `${name} deleted successfully.`, 'success');
  loadStaff();
};

// --- Delete Vendor ---
window.deleteVendor = async (id, name) => {
  const confirmed = confirm(`Delete vendor "${name}"? This cannot be undone.`);
  if (!confirmed) return;

  const { ok, data } = await apiFetch(`/vendors/${id}`, { method: 'DELETE' });

  if (!ok) return showAlert('vendorAlert', data.error || 'Failed to delete vendor.');

  showAlert('vendorAlert', `${name} deleted successfully.`, 'success');
  loadVendors();
};

// --- Delete All Event Data ---
document.getElementById('deleteAllBtn').addEventListener('click', async () => {
  const first = confirm('Are you sure you want to delete ALL event data? This includes all transactions, attendees, and resets vendors and staff.');
  if (!first) return;

  const second = confirm('This cannot be undone. Confirm once more to proceed.');
  if (!second) return;

  const { ok, data } = await apiFetch(`/events/${event_id}/data`, {
    method: 'DELETE'
  });

  if (!ok) return showAlert('summaryAlert', data.error || 'Failed to delete event data.');

  showAlert('summaryAlert', 'All event data deleted successfully.', 'success');
  loadSummary();
  loadTransactions();
  loadVendors();
  loadStaff();
});

// --- Init ---
loadSummary();
loadTransactions();
loadVendors();
loadStaff();
initRealtime();
