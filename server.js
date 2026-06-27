import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Middleware ───────────────────────────────────────────────────────────────

function authenticate(allowedRoles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      req.staff = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

app.post('/api/setup', async (req, res) => {
  const { setup_secret, event, admin } = req.body;

  if (!setup_secret || setup_secret !== process.env.SETUP_SECRET) {
    return res.status(401).json({ error: 'Invalid setup secret' });
  }

  if (!event?.name || !event?.date || !event?.event_code) {
    return res.status(400).json({ error: 'event.name, event.date and event.event_code are required' });
  }

  if (!admin?.name || !admin?.username || !admin?.pin) {
    return res.status(400).json({ error: 'admin.name, admin.username and admin.pin are required' });
  }

  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event.event_code)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Event code already exists' });
  }

  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({ name: event.name, date: event.date, event_code: event.event_code })
    .select()
    .single();

  if (eventError) return res.status(500).json({ error: eventError.message });

  const hashedPin = await bcrypt.hash(admin.pin, 10);

  const { data: newAdmin, error: adminError } = await supabase
    .from('staff')
    .insert({
      event_id: newEvent.id,
      name: admin.name,
      username: admin.username,
      role: 'admin',
      pin: hashedPin
    })
    .select('id, name, username, role')
    .single();

  if (adminError) return res.status(500).json({ error: adminError.message });

  return res.status(201).json({ message: 'Setup complete', event: newEvent, admin: newAdmin });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/staff/auth', async (req, res) => {
  const { event_code, username, pin } = req.body;

  if (!event_code || !username || !pin) {
    return res.status(400).json({ error: 'event_code, username and pin are required' });
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event_code)
    .eq('is_active', true)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ error: 'Event not found or inactive' });
  }

  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, pin')
    .eq('event_id', event.id)
    .eq('username', username)
    .single();

  if (staffError || !staff) {
    return res.status(404).json({ error: 'Staff not found' });
  }

  const pinMatch = await bcrypt.compare(pin, staff.pin);
  if (!pinMatch) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  const token = jwt.sign(
    { staff_id: staff.id, event_id: event.id, role: staff.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.status(200).json({
    token,
    staff: { id: staff.id, name: staff.name, role: staff.role },
    event_id: event.id
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

app.post('/api/events', authenticate(['admin']), async (req, res) => {
  const { name, date, event_code } = req.body;

  if (!name || !date || !event_code) {
    return res.status(400).json({ error: 'name, date and event_code are required' });
  }

  const { data, error } = await supabase
    .from('events')
    .insert({ name, date, event_code })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'event_code already exists' });
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});

app.get('/api/events/:id', authenticate(['admin', 'manager', 'cashier']), async (req, res) => {
  const { id } = req.params;

  if (req.staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabase
    .from('events')
    .select(`
      id, name, date, event_code, is_active, created_at,
      vendors ( id, name, balance ),
      staff ( id, name, role, username )
    `)
    .eq('id', id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Event not found' });

  return res.status(200).json(data);
});

app.post('/api/events/:id/staff', authenticate(['admin']), async (req, res) => {
  const { name, username, role, pin } = req.body;

  if (!name || !username || !role || !pin) {
    return res.status(400).json({ error: 'name, username, role and pin are required' });
  }

  const hashedPin = await bcrypt.hash(pin, 10);

  const { data, error } = await supabase
    .from('staff')
    .insert({
      event_id: req.staff.event_id,
      name, username, role,
      pin: hashedPin
    })
    .select('id, name, username, role')
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Username already exists for this event' });
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});

app.get('/api/events/:id/summary', authenticate(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;

  if (req.staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('transaction_type, amount, vendor_id')
    .eq('event_id', id);

  if (txError) return res.status(500).json({ error: txError.message });

  const { data: vendors, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name, balance')
    .eq('event_id', id);

  if (vendorError) return res.status(500).json({ error: vendorError.message });

  const { data: attendees, error: attendeeError } = await supabase
    .from('attendees')
    .select('balance')
    .eq('event_id', id);

  if (attendeeError) return res.status(500).json({ error: attendeeError.message });

  const totals = transactions.reduce(
    (acc, tx) => {
      if (tx.transaction_type === 'top_up') acc.total_topped_up += tx.amount;
      if (tx.transaction_type === 'payment') acc.total_spent += tx.amount;
      if (tx.transaction_type === 'refund') acc.total_refunded += tx.amount;
      if (tx.transaction_type === 'donation') acc.total_donated += tx.amount;
      return acc;
    },
    { total_topped_up: 0, total_spent: 0, total_refunded: 0, total_donated: 0 }
  );

  const vendor_breakdown = vendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    token_balance: vendor.balance,
    total_received: transactions
      .filter(tx => tx.vendor_id === vendor.id && tx.transaction_type === 'payment')
      .reduce((sum, tx) => sum + tx.amount, 0)
  }));

  return res.status(200).json({
    total_attendees: attendees.length,
    total_topped_up: totals.total_topped_up,
    total_spent: totals.total_spent,
    total_refunded: totals.total_refunded,
    total_donated: totals.total_donated,
    total_remaining_balance: attendees.reduce((sum, a) => sum + a.balance, 0),
    vendor_breakdown
  });
});

app.get('/api/events/:id/transactions', authenticate(['admin', 'manager']), async (req, res) => {
  const { id } = req.params;

  if (req.staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { type, from, to } = req.query;

  let query = supabase
    .from('transactions')
    .select(`
      id, transaction_type, amount, created_at,
      attendees ( id, name, qr_code_id ),
      vendors ( id, name ),
      staff ( id, name, role )
    `)
    .eq('event_id', id)
    .order('created_at', { ascending: false });

  if (type) query = query.eq('transaction_type', type);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json(data);
});

// ─── Attendees ────────────────────────────────────────────────────────────────

// Generate a batch of inactive QR cards
app.post('/api/attendees/generate', authenticate(['admin']), async (req, res) => {
  const { count } = req.body;

  if (!count || count < 1 || count > 500) {
    return res.status(400).json({ error: 'count must be between 1 and 500' });
  }

  const cards = [];
  for (let i = 0; i < count; i++) {
    cards.push({
      event_id: req.staff.event_id,
      qr_code_id: uuidv4(),
      status: 'inactive',
      balance: 0
    });
  }

  const { data, error } = await supabase
    .from('attendees')
    .insert(cards)
    .select('id, qr_code_id');

  if (error) return res.status(500).json({ error: error.message });

  // Generate QR code images for each card
  const cardsWithQR = await Promise.all(
    data.map(async (card) => ({
      id: card.id,
      qr_code_id: card.qr_code_id,
      qr_code_image: await QRCode.toDataURL(card.qr_code_id)
    }))
  );

  return res.status(201).json({ count: cardsWithQR.length, cards: cardsWithQR });
});

// Activate a card at the gate
app.post('/api/attendees/activate', authenticate(['admin', 'cashier']), async (req, res) => {
  const { qr_code_id, name } = req.body;

  if (!qr_code_id) {
    return res.status(400).json({ error: 'qr_code_id is required' });
  }

  const { data: attendee, error: fetchError } = await supabase
    .from('attendees')
    .select('id, status')
    .eq('qr_code_id', qr_code_id)
    .eq('event_id', req.staff.event_id)
    .single();

  if (fetchError || !attendee) {
    return res.status(404).json({ error: 'Card not found for this event' });
  }

  if (attendee.status === 'active') {
    return res.status(409).json({ error: 'Card is already active' });
  }

  if (attendee.status === 'disabled') {
    return res.status(403).json({ error: 'Card has been disabled' });
  }

  const { data, error } = await supabase
    .from('attendees')
    .update({ status: 'active', name: name || null })
    .eq('id', attendee.id)
    .select('id, qr_code_id, name, balance, status')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'Card activated successfully', attendee: data });
});

// Disable a card
app.post('/api/attendees/:id/disable', authenticate(['admin']), async (req, res) => {
  const { data, error } = await supabase
    .from('attendees')
    .update({ status: 'disabled' })
    .eq('id', req.params.id)
    .eq('event_id', req.staff.event_id)
    .select('id, qr_code_id, status')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Attendee not found' });

  return res.status(200).json({ message: 'Card disabled', attendee: data });
});

app.get('/api/attendees/qr/:qr_code_id', async (req, res) => {
  const { qr_code_id } = req.params;

  const { data, error } = await supabase
    .from('attendees')
    .select('id, name, balance, status')
    .eq('qr_code_id', qr_code_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Attendee not found' });
  if (data.status !== 'active') return res.status(403).json({ error: 'Attendee card is not active' });

  return res.status(200).json(data);
});

app.post('/api/attendees/:id/topup', authenticate(['admin', 'cashier']), async (req, res) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }

  const { data, error } = await supabase.rpc('process_topup', {
    p_event_id: req.staff.event_id,
    p_attendee_id: req.params.id,
    p_amount: amount,
    p_staff_id: req.staff.staff_id
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({ message: 'Top up successful', new_balance: data.new_balance });
});

app.post('/api/attendees/:id/refund', authenticate(['admin', 'cashier']), async (req, res) => {
  const { data, error } = await supabase.rpc('process_exit', {
    p_event_id: req.staff.event_id,
    p_attendee_id: req.params.id,
    p_type: 'refund',
    p_staff_id: req.staff.staff_id
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({ message: 'Refund successful', amount: data.amount });
});

app.post('/api/attendees/:id/donate', authenticate(['admin', 'cashier']), async (req, res) => {
  const { data, error } = await supabase.rpc('process_exit', {
    p_event_id: req.staff.event_id,
    p_attendee_id: req.params.id,
    p_type: 'donation',
    p_staff_id: req.staff.staff_id
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({ message: 'Donation successful', amount: data.amount });
});

// ─── Vendors ──────────────────────────────────────────────────────────────────

app.post('/api/vendors', authenticate(['admin']), async (req, res) => {
  const { name, description, vendor_code, pin } = req.body;

  if (!name || !vendor_code || !pin) {
    return res.status(400).json({ error: 'name, vendor_code and pin are required' });
  }

  const hashedPin = await bcrypt.hash(pin, 10);

  const { data, error } = await supabase
    .from('vendors')
    .insert({ event_id: req.staff.event_id, name, description: description || null, vendor_code, pin: hashedPin })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Vendor code already exists for this event' });
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
});
app.post('/api/vendors/login', async (req, res) => {
  const { event_code, vendor_code, pin } = req.body;

  if (!event_code || !vendor_code || !pin) {
    return res.status(400).json({ error: 'event_code, vendor_code and pin are required' });
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event_code)
    .eq('is_active', true)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ error: 'Event not found or inactive' });
  }

  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name, description, balance, pin')
    .eq('vendor_code', vendor_code)
    .eq('event_id', event.id)
    .single();

  if (vendorError || !vendor) {
    return res.status(404).json({ error: 'Vendor not found for this event' });
  }

  const pinMatch = await bcrypt.compare(pin, vendor.pin);
  if (!pinMatch) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  // Don't return the PIN
  const { pin: _, ...vendorData } = vendor;

  return res.status(200).json({ vendor: vendorData, event_id: event.id });
});
app.get('/api/vendors/:id/balance', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  let event_id = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      if (!['admin', 'manager'].includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      event_id = decoded.event_id;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else {
    event_id = req.query.event_id;
    if (!event_id) return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, balance')
    .eq('id', id)
    .eq('event_id', event_id)
    .single();

  if (error || !data) return res.status(404).json({ error: 'Vendor not found' });

  return res.status(200).json(data);
});

app.post('/api/vendors/:id/charge', async (req, res) => {
  const { id } = req.params;
  const { qr_code_id, amount, event_id: bodyEventId } = req.body;

  if (!qr_code_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'qr_code_id and a positive amount are required' });
  }

  let event_id = null;
  let staff_id = null;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
      if (!['admin', 'cashier'].includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      event_id = decoded.event_id;
      staff_id = decoded.staff_id;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else {
    if (!bodyEventId) return res.status(401).json({ error: 'Unauthorized' });
    event_id = bodyEventId;
  }

  const { data, error } = await supabase.rpc('process_charge', {
    p_event_id: event_id,
    p_vendor_id: id,
    p_qr_code_id: qr_code_id,
    p_amount: amount,
    p_staff_id: staff_id || null
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({
    message: 'Charge successful',
    attendee_new_balance: data.attendee_new_balance,
    vendor_new_balance: data.vendor_new_balance
  });
});

// Soft delete staff
app.delete('/api/staff/:id', authenticate(['admin']), async (req, res) => {
  const { id } = req.params;

  if (id === req.staff.staff_id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const { error } = await supabase
    .from('staff')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('event_id', req.staff.event_id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'Staff deleted successfully' });
});

// Soft delete vendor
app.delete('/api/vendors/:id', authenticate(['admin']), async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('vendors')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('event_id', req.staff.event_id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'Vendor deleted successfully' });
});

// Delete all event data
app.delete('/api/events/:id/data', authenticate(['admin']), async (req, res) => {
  const { id } = req.params;

  if (req.staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { error } = await supabase.rpc('delete_event_data', { p_event_id: id });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ message: 'All event data deleted successfully' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
