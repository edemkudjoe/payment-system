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

  const staff = authenticate(req, res, ['admin', 'manager', 'cashier']);
  if (!staff) return;

  const { qr_code_id } = req.query;

  const { data, error } = await supabase
    .from('attendees')
    .select('id, name, balance, is_active, created_at')
    .eq('qr_code_id', qr_code_id)
    .eq('event_id', staff.event_id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Attendee not found' });
  }

  if (!data.is_active) {
    return res.status(403).json({ error: 'Attendee card is inactive' });
  }

  return res.status(200).json(data);
}