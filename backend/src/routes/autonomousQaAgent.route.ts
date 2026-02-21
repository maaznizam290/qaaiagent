import { Router } from 'express';

import { autonomousQaAgentController } from '../controllers/autonomousQaAgentController';

const router = Router();

router.post('/autonomous-qa-agent/analyze', autonomousQaAgentController.analyzeProduct);

export default router;

