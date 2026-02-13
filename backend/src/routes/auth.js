const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { all, get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { validateBody, registerSchema, loginSchema } = require('../middleware/validate');

const router = express.Router();

function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    (process.env.JWT_SECRET || "dev-only-secret-change-me"),
    { expiresIn: '7d' }
  );
}

router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.validatedBody;

  try {
    const normalizedEmail = email.toLowerCase();
    const existing = await get('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
    if (existing) {
      res.status(409).json({ error: 'Email is already registered (user already exists)' });
      return;
    }

    const existingHashes = await all('SELECT password_hash FROM users');
    for (const row of existingHashes) {
      const samePassword = await bcrypt.compare(password, row.password_hash);
      if (samePassword) {
        res.status(409).json({ error: 'Password is already registered. Use a unique password.' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insertResult = await run(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, normalizedEmail, passwordHash, 'user']
    );

    const user = {
      id: insertResult.lastID,
      name,
      email: normalizedEmail,
      role: 'user',
    };

    const token = issueToken(user);
    res.status(201).json({ token, user });
  } catch (error) {
    res.status(500).json({ error: 'Unable to register user' });
  }
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.validatedBody;

  try {
    const userRow = await get('SELECT id, name, email, password_hash, role FROM users WHERE email = ?', [
      email.toLowerCase(),
    ]);

    if (!userRow) {
      res.status(401).json({ error: 'This user is not found' });
      return;
    }

    const validPassword = await bcrypt.compare(password, userRow.password_hash);
    if (!validPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
    };

    const token = issueToken(user);
    res.json({ token, user });
  } catch (error) {
    res.status(500).json({ error: 'Unable to log in' });
  }
});

router.get('/exists', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  try {
    const userRow = await get('SELECT id FROM users WHERE email = ?', [email]);
    res.json({ exists: Boolean(userRow) });
  } catch (error) {
    res.status(500).json({ error: 'Unable to check user existence' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await get('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.sub]);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Unable to fetch profile' });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  res.json({ message: 'Logged out. Please remove the token client-side.' });
});

module.exports = router;

