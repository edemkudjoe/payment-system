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

  const staff = authenticate(req, res, ['admin']);
  if (!staff) return;

  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const { data, error } = await supabase
    .from('vendors')
    .insert({
      event_id: staff.event_id,
      name,
      description: description || null
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
}