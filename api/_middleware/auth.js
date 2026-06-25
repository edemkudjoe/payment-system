import jwt from 'jsonwebtoken';

export function authenticate(req, res, allowedRoles = []) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid token' });
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return null;
    }

    return decoded; // { staff_id, event_id, role }
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }
}