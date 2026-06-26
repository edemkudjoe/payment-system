import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { qr_code_id, amount, event_id: bodyEventId } = req.body;

  if (!qr_code_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'qr_code_id and a positive amount are required' });
  }

  let event_id = null;
  let staff_id = null;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Staff-initiated charge
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!['admin', 'cashier'].includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      event_id = decoded.event_id;
      staff_id = decoded.staff_id;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } else {
    // Vendor-initiated charge — event_id must be in body
    if (!bodyEventId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    event_id = bodyEventId;
  }

  // Verify vendor belongs to event
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, balance')
    .eq('id', id)
    .eq('event_id', event_id)
    .single();

  if (vendorError || !vendor) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  // Call atomic RPC
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
}