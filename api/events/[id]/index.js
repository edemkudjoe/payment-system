import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../_middleware/auth.js';

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

  const { id } = req.query;

  // Staff can only access their own event
  if (staff.event_id !== id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabase
    .from('events')
    .select(`
      id,
      name,
      date,
      event_code,
      is_active,
      created_at,
      vendors ( id, name, balance ),
      staff ( id, name, role, username )
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Event not found' });
  }

  return res.status(200).json(data);
}