import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../_middleware/auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const staff = authenticate(req, res, ['admin', 'manager']);
  if (!staff) return;

  const { id } = req.query;

  if (staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Fetch all transactions for the event
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('transaction_type, amount, vendor_id')
    .eq('event_id', id);

  if (txError) {
    return res.status(500).json({ error: txError.message });
  }

  // Fetch vendors
  const { data: vendors, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name, balance')
    .eq('event_id', id);

  if (vendorError) {
    return res.status(500).json({ error: vendorError.message });
  }

  // Fetch attendee count and total remaining balance
  const { data: attendees, error: attendeeError } = await supabase
    .from('attendees')
    .select('balance')
    .eq('event_id', id);

  if (attendeeError) {
    return res.status(500).json({ error: attendeeError.message });
  }

  // Compute totals
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

  // Per vendor breakdown
  const vendor_breakdown = vendors.map(vendor => ({
    id: vendor.id,
    name: vendor.name,
    token_balance: vendor.balance,
    total_received: transactions
      .filter(tx => tx.vendor_id === vendor.id && tx.transaction_type === 'payment')
      .reduce((sum, tx) => sum + tx.amount, 0)
  }));

  const total_remaining_balance = attendees.reduce((sum, a) => sum + a.balance, 0);

  return res.status(200).json({
    total_attendees: attendees.length,
    total_topped_up: totals.total_topped_up,
    total_spent: totals.total_spent,
    total_refunded: totals.total_refunded,
    total_donated: totals.total_donated,
    total_remaining_balance,
    vendor_breakdown
  });
}