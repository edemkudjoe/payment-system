import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../_middleware/auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const staff = authenticate(req, res, ['admin', 'cashier']);
  if (!staff) return;

  const { id } = req.query;

  // Verify attendee belongs to staff's event
  const { data: attendee, error: attendeeError } = await supabase
    .from('attendees')
    .select('id, balance, is_active')
    .eq('id', id)
    .eq('event_id', staff.event_id)
    .single();

  if (attendeeError || !attendee) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  if (!attendee.is_active) {
    return res.status(403).json({ error: 'Attendee card is inactive' });
  }

  if (attendee.balance === 0) {
    return res.status(400).json({ error: 'No tokens to refund' });
  }

  const refundAmount = attendee.balance;

  // Zero out balance and log transaction
  const { error: balanceError } = await supabase
    .from('attendees')
    .update({ balance: 0 })
    .eq('id', id);

  if (balanceError) {
    return res.status(500).json({ error: balanceError.message });
  }

  const { data, error } = await supabase.rpc('process_exit', {
    p_event_id: staff.event_id,
    p_attendee_id: id,
    p_type: 'refund', // or 'donation'
    p_staff_id: staff.staff_id
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({
  message: 'Refund successful', // or 'Donation successful'
  amount: data.amount
  });
}