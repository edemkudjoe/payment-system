import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_code, username, pin } = req.body;

  if (!event_code || !username || !pin) {
    return res.status(400).json({ error: 'event_code, username and pin are required' });
  }

  // Find event by code
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event_code)
    .eq('is_active', true)
    .single();

  if (eventError || !event) {
    return res.status(404).json({ error: 'Event not found or inactive' });
  }

  // Find staff by event + username
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .select('id, name, role, pin')
    .eq('event_id', event.id)
    .eq('username', username)
    .single();

  if (staffError || !staff) {
    return res.status(404).json({ error: 'Staff not found' });
  }

  // Verify PIN
  const pinMatch = await bcrypt.compare(pin, staff.pin);
  if (!pinMatch) {
    return res.status(401).json({ error: 'Invalid PIN' });
  }

  // Sign JWT
  const token = jwt.sign(
    {
      staff_id: staff.id,
      event_id: event.id,
      role: staff.role
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.status(200).json({
    token,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role
    },
    event_id: event.id
  });
}