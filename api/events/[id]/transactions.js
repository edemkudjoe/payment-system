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

  const { type, from, to } = req.query;

  let query = supabase
    .from('transactions')
    .select(`
      id,
      transaction_type,
      amount,
      created_at,
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

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json(data);
}