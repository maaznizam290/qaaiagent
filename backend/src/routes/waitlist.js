const express = require('express');

const { all, get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody, waitlistSchema } = require('../middleware/validate');

const router = express.Router();

router.post('/', validateBody(waitlistSchema), async (req, res) => {
  const { email, fullName, company, role } = req.validatedBody;
  const authHeader = req.headers.authorization;
  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, (process.env.JWT_SECRET || "dev-only-secret-change-me"));
      userId = payload.sub;
    } catch (error) {
      userId = null;
    }
  }

  try {
    const normalizedEmail = email.toLowerCase();
    const existing = await get('SELECT id FROM waitlist WHERE email = ?', [normalizedEmail]);
    if (existing) {
      res.status(409).json({ error: 'Email is already on the waitlist' });
      return;
    }

    const result = await run(
      'INSERT INTO waitlist (email, full_name, company, role, user_id) VALUES (?, ?, ?, ?, ?)',
      [normalizedEmail, fullName || null, company || null, role || null, userId]
    );

    res.status(201).json({
      id: result.lastID,
      message: "You're on the waitlist! We'll be in touch soon.",
    });
  } catch (error) {
    res.status(500).json({ error: 'Unable to submit waitlist request' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const rows = await all(
      'SELECT id, email, full_name, company, role, user_id, created_at FROM waitlist ORDER BY created_at DESC'
    );
    res.json({ entries: rows });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch waitlist entries' });
  }
});

module.exports = router;

