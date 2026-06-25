import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Guard with setup secret
  const { setup_secret, event, admin } = req.body;

  if (!setup_secret || setup_secret !== process.env.SETUP_SECRET) {
    return res.status(401).json({ error: 'Invalid setup secret' });
  }

  if (!event?.name || !event?.date || !event?.event_code) {
    return res.status(400).json({ error: 'event.name, event.date and event.event_code are required' });
  }

  if (!admin?.name || !admin?.username || !admin?.pin) {
    return res.status(400).json({ error: 'admin.name, admin.username and admin.pin are required' });
  }

  // Check if event code already exists
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('event_code', event.event_code)
    .single();

  if (existing) {
    return res.status(409).json({ error: 'Event code already exists' });
  }

  // Create event
  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      name: event.name,
      date: event.date,
      event_code: event.event_code
    })
    .select()
    .single();

  if (eventError) {
    return res.status(500).json({ error: eventError.message });
  }

  // Hash PIN and create admin
  const hashedPin = await bcrypt.hash(admin.pin, 10);

  const { data: newAdmin, error: adminError } = await supabase
    .from('staff')
    .insert({
      event_id: newEvent.id,
      name: admin.name,
      username: admin.username,
      role: 'admin',
      pin: hashedPin
    })
    .select('id, name, username, role')
    .single();

  if (adminError) {
    return res.status(500).json({ error: adminError.message });
  }

  return res.status(201).json({
    message: 'Setup complete',
    event: newEvent,
    admin: newAdmin
  });
}