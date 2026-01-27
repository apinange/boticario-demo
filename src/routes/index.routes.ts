import { Router } from 'express';
import { handleWebhook } from '../controllers/webhook.controller';
import { sendAgentMessage } from '../controllers/agent.controller';
import { getHealth } from '../controllers/health.controller';
import { getStatus } from '../controllers/status.controller';
import { 
  getInstances, 
  createInstance, 
  getQrCode,
  getQrCodeImage, 
  reconnectInstance, 
  logoutInstance 
} from '../controllers/instance.controller';
import { setupWebhook } from '../controllers/webhook-config.controller';
import { getBotModeStatus, setBotModeEndpoint } from '../controllers/bot-mode.controller';
import { 
  getAgentModeStatus, 
  listAgentModes, 
  enableAgentMode, 
  disableAgentMode, 
  clearAllAgentModesEndpoint 
} from '../controllers/agent-mode.controller';
import { restartOCPSession, startConversation } from '../controllers/ocp.controller';
import { sendMessage, sendOCPMessage } from '../controllers/message.controller';

const router = Router();

router.get('/health', getHealth);
router.get('/status', getStatus);
router.post('/webhook', handleWebhook);
router.post('/agent/message', sendAgentMessage);

/**
 * @swagger
 * /api/instances:
 *   get:
 *     summary: Get all WhatsApp instances
 *     tags: [Instance]
 *     responses:
 *       200:
 *         description: List of instances
 */
router.get('/api/instances', getInstances);

/**
 * @swagger
 * /api/instances:
 *   post:
 *     summary: Create a new WhatsApp instance
 *     tags: [Instance]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Instance created successfully
 */
router.post('/api/instances', createInstance);

/**
 * @swagger
 * /api/instances/qr:
 *   get:
 *     summary: Get QR code for instance
 *     tags: [Instance]
 *     parameters:
 *       - in: query
 *         name: instanceName
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: QR code data
 */
router.get('/api/instances/qr', getQrCode);
router.get('/api/instances/qr/image', getQrCodeImage);

/**
 * @swagger
 * /api/instances/reconnect:
 *   post:
 *     summary: Reconnect instance and get new QR code
 *     tags: [Instance]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reconnected successfully
 */
router.post('/api/instances/reconnect', reconnectInstance);

/**
 * @swagger
 * /api/instances/logout:
 *   post:
 *     summary: Logout instance
 *     tags: [Instance]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/api/instances/logout', logoutInstance);

/**
 * @swagger
 * /api/webhook/setup:
 *   post:
 *     summary: Setup webhook for instance
 *     tags: [Webhook Config]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - webhookUrl
 *             properties:
 *               webhookUrl:
 *                 type: string
 *               instanceName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook configured successfully
 */
router.post('/api/webhook/setup', setupWebhook);

/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: Send a text message to WhatsApp
 *     tags: [Message]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - text
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent successfully
 */
router.post('/api/messages', sendMessage);

/**
 * @swagger
 * /api/messages/ocp:
 *   post:
 *     summary: Send a message initiated by OCP
 *     tags: [Message]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - text
 *             properties:
 *               phoneNumber:
 *                 type: string
 *               text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent successfully
 */
router.post('/api/messages/ocp', sendOCPMessage);

/**
 * @swagger
 * /api/bot-mode:
 *   get:
 *     summary: Get current bot mode
 *     tags: [Bot Mode]
 *     responses:
 *       200:
 *         description: Current bot mode
 */
router.get('/api/bot-mode', getBotModeStatus);

/**
 * @swagger
 * /api/bot-mode:
 *   post:
 *     summary: Set bot mode (proactive or reactive)
 *     tags: [Bot Mode]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mode
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [proactive, reactive]
 *     responses:
 *       200:
 *         description: Bot mode updated
 */
router.post('/api/bot-mode', setBotModeEndpoint);

/**
 * @swagger
 * /api/agent-mode:
 *   get:
 *     summary: Get agent mode status for a phone number
 *     tags: [Agent Mode]
 *     parameters:
 *       - in: query
 *         name: phoneNumber
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent mode status
 */
router.get('/api/agent-mode', getAgentModeStatus);

/**
 * @swagger
 * /api/agent-mode/list:
 *   get:
 *     summary: List all phone numbers in agent mode
 *     tags: [Agent Mode]
 *     responses:
 *       200:
 *         description: List of phone numbers
 */
router.get('/api/agent-mode/list', listAgentModes);

/**
 * @swagger
 * /api/agent-mode/enable:
 *   post:
 *     summary: Enable agent mode for a phone number
 *     tags: [Agent Mode]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent mode enabled
 */
router.post('/api/agent-mode/enable', enableAgentMode);

/**
 * @swagger
 * /api/agent-mode/disable:
 *   post:
 *     summary: Disable agent mode for a phone number
 *     tags: [Agent Mode]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Agent mode disabled
 */
router.post('/api/agent-mode/disable', disableAgentMode);

/**
 * @swagger
 * /api/agent-mode/clear:
 *   post:
 *     summary: Clear all agent modes
 *     tags: [Agent Mode]
 *     responses:
 *       200:
 *         description: All agent modes cleared
 */
router.post('/api/agent-mode/clear', clearAllAgentModesEndpoint);

/**
 * @swagger
 * /api/ocp/restart:
 *   post:
 *     summary: Restart OCP session
 *     tags: [OCP]
 *     responses:
 *       200:
 *         description: OCP session restart initiated
 */
router.post('/api/ocp/restart', restartOCPSession);

/**
 * @swagger
 * /api/ocp/start-conversation:
 *   post:
 *     summary: Start a conversation (proactive mode only)
 *     tags: [OCP]
 *     responses:
 *       200:
 *         description: Conversation started
 */
router.post('/api/ocp/start-conversation', startConversation);

export default router;

