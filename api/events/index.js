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
    if (error.code === '23505') {
      return res.status(409).json({ error: 'event_code already exists' });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
}