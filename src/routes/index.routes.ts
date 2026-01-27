import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook.controller';
import { sendAgentMessage } from '../controllers/agent.controller';
import { getHealth } from '../controllers/health.controller';
import { getStatus } from '../controllers/status.controller';

const router = Router();

// Webhook endpoint
router.post('/webhook', handleWebhook);

// Agent endpoint
router.post('/agent/message', sendAgentMessage);

// Health and status
router.get('/health', getHealth);
router.get('/status', getStatus);

export default router;
