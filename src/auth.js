const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.SESSION_SECRET || '';
  if (process.env.NODE_ENV === 'production' && secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
  return secret || 'development-only-secret-change-me-please';
}

function signAdmin(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email, role: 'admin' }, getSecret(), { expiresIn: '8h' });
}

function readAdmin(req) {
  const token = req.cookies.watair_admin;
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  const admin = readAdmin(req);
  if (!admin) return res.redirect('/admin/login');
  req.admin = admin;
  next();
}

function csrfFor(req) {
  const token = req.cookies.watair_admin || 'anonymous';
  return crypto.createHmac('sha256', getSecret()).update(token).digest('hex');
}

function requireCsrf(req, res, next) {
  const supplied = String(req.body?._csrf || req.get('x-csrf-token') || '');
  const expected = csrfFor(req);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
}

module.exports = { signAdmin, readAdmin, requireAdmin, csrfFor, requireCsrf };
