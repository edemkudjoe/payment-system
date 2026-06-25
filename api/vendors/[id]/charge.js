import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../_middleware/auth.js';

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

  const { id } = req.query; // vendor id
  const { qr_code_id, amount } = req.body;

  if (!qr_code_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'qr_code_id and a positive amount are required' });
  }

  // Fetch vendor
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, balance')
    .eq('id', id)
    .eq('event_id', staff.event_id)
    .single();

  if (vendorError || !vendor) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  // Fetch attendee by QR code
  const { data: attendee, error: attendeeError } = await supabase
    .from('attendees')
    .select('id, balance, is_active')
    .eq('qr_code_id', qr_code_id)
    .eq('event_id', staff.event_id)
    .single();

  if (attendeeError || !attendee) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  if (!attendee.is_active) {
    return res.status(403).json({ error: 'Attendee card is inactive' });
  }

  if (attendee.balance < amount) {
    return res.status(400).json({ error: 'Insufficient token balance' });
  }

  // Deduct from attendee
  const { error: attendeeUpdateError } = await supabase
    .from('attendees')
    .update({ balance: attendee.balance - amount })
    .eq('id', attendee.id);

  if (attendeeUpdateError) {
    return res.status(500).json({ error: attendeeUpdateError.message });
  }

  // Credit vendor
  const { error: vendorUpdateError } = await supabase
    .from('vendors')
    .update({ balance: vendor.balance + amount })
    .eq('id', vendor.id);

  if (vendorUpdateError) {
    // Attempt to roll back attendee balance
    await supabase
      .from('attendees')
      .update({ balance: attendee.balance })
      .eq('id', attendee.id);

    return res.status(500).json({ error: 'Charge failed, transaction rolled back' });
  }

  // Log transaction
  const { data, error } = await supabase.rpc('process_charge', {
    p_event_id: staff.event_id,
    p_vendor_id: id,
    p_qr_code_id: qr_code_id,
    p_amount: amount,
    p_staff_id: staff.staff_id
  });

  if (error) return res.status(500).json({ error: error.message });
  if (data.error) return res.status(400).json({ error: data.error });

  return res.status(200).json({
  message: 'Charge successful',
  attendee_new_balance: data.attendee_new_balance,
  vendor_new_balance: data.vendor_new_balance
  });
}