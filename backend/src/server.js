const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const flowRoutes = require('./routes/flows');
const waitlistRoutes = require('./routes/waitlist');

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (origin === allowedOrigin || origin.startsWith('chrome-extension://')) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/flows', flowRoutes);
app.use('/api/waitlist', waitlistRoutes);

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({
      error: 'Request payload too large. Reduce DOM snapshot size or increase server body limit.',
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
