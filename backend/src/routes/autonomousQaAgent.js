const express = require('express');

const { analyzeProduct } = require('../controllers/autonomousQaAgent');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/autonomous-qa-agent/analyze', requireAuth, analyzeProduct);

module.exports = router;

