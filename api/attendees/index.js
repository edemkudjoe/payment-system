import { createClient } from '@supabase/supabase-js';
import { authenticate } from '../_middleware/auth.js';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const staff = authenticate(req, res, ['admin', 'cashier']);
  if (!staff) return;

  const { name } = req.body;

  // Generate unique QR code ID
  const qr_code_id = uuidv4();

  // Generate QR code as base64 image
  let qr_code_image;
  try {
    qr_code_image = await QRCode.toDataURL(qr_code_id);
  } catch {
    return res.status(500).json({ error: 'Failed to generate QR code' });
  }

  const { data, error } = await supabase
    .from('attendees')
    .insert({
      event_id: staff.event_id,
      name: name || null,
      qr_code_id
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({
    ...data,
    qr_code_image // base64 PNG, ready to display or print
  });
}