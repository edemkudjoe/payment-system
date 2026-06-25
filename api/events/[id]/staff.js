import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../../_middleware/auth.js';
import bcrypt from 'bcryptjs';

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

  const { name, username, role, pin } = req.body;

  if (!name || !username || !role || !pin) {
    return res.status(400).json({ error: 'name, username, role and pin are required' });
  }

  const hashedPin = await bcrypt.hash(pin, 10);

  const { data, error } = await supabase
    .from('staff')
    .insert({
      event_id: staff.event_id,
      name,
      username,
      role,
      pin: hashedPin
    })
    .select('id, name, username, role')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Username already exists for this event' });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json(data);
}