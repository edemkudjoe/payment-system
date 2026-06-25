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

  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, balance')
    .eq('id', id)
    .eq('event_id', staff.event_id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  return res.status(200).json(data);
}