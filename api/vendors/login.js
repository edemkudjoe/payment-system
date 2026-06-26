import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { event_code, vendor_id } = req.body;

  if (!event_code || !vendor_id) {
    return res.status(400).json({ error: 'event_code and vendor_id are required' });
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

  // Find vendor by id scoped to event
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors')
    .select('id, name, description, balance')
    .eq('id', vendor_id)
    .eq('event_id', event.id)
    .single();

  if (vendorError || !vendor) {
    return res.status(404).json({ error: 'Vendor not found for this event' });
  }

  return res.status(200).json({
    vendor,
    event_id: event.id
  });
}