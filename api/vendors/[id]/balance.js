import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const { event_id } = req.query;

  // Two auth paths:
  // 1. Staff JWT (admin/manager) — standard auth
  // 2. Vendor self-access — passes event_id as query param, no JWT needed

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // Staff JWT path
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!['admin', 'manager'].includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { data, error } = await supabase
        .from('vendors')
        .select('id, name, balance')
        .eq('id', id)
        .eq('event_id', decoded.event_id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      return res.status(200).json(data);

    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  // Vendor self-access path — requires event_id query param
  if (!event_id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase
    .from('vendors')
    .select('id, name, balance')
    .eq('id', id)
    .eq('event_id', event_id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: 'Vendor not found' });
  }

  return res.status(200).json(data);
}