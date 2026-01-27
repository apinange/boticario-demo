import { Request, Response } from 'express';
import { isInAgentMode } from '../features/agent-mode';
import { getMessageLogger } from '../core/message-logger';
import { evolutionApiService } from '../services/evolution-api.service';
import { config } from '../config/env.config';

/**
 * @swagger
 * /agent/message:
 *   post:
 *     summary: Send message from agent to WhatsApp
 *     description: Allows a human agent to send a message to the user via WhatsApp. The phone number is automatically set to the configured default number.
 *     tags: [Agent]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Message text to send
 *                 example: "Olá! Como posso ajudar?"
 *     responses:
 *       200:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messageId:
 *                   type: string
 *       400:
 *         description: Bad request - missing text or agent mode not active
 *       500:
 *         description: Server error
 *       503:
 *         description: Evolution API not accessible
 */
export const sendAgentMessage = async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const { text } = req.body;

    // Validate request
    if (!text) {
      return res.status(400).json({ 
        error: 'Missing required field: text is required' 
      });
    }

    // Always use DEFAULT_PHONE_NUMBER (user/client number)
    const phoneNumber = config.defaultPhoneNumber;

    // Check if phone number is in agent mode
    if (!isInAgentMode(phoneNumber)) {
      console.log(`[${timestamp}] ⚠️  Tentativa de enviar mensagem de agente para número não em modo agente: ${phoneNumber}`);
      return res.status(400).json({ 
        error: `Phone number ${phoneNumber} is not in agent mode. Agent mode must be activated first.` 
      });
    }

    console.log(`\n[${timestamp}] 📤 RECEBENDO MENSAGEM DO AGENTE`);
    console.log(`[${timestamp}]    Phone (destinatário): ${phoneNumber}`);
    console.log(`[${timestamp}]    Message: "${text}"`);

    try {
      // Send message to WhatsApp via Evolution API
      const messageId = await evolutionApiService.sendTextMessage(phoneNumber, text);

      if (messageId) {
        console.log(`[${timestamp}] ✅ Mensagem do agente enviada para WhatsApp`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);

        // Log BOT message (agent message)
        const logger = getMessageLogger();
        await logger.logBotMessage({
          phoneNumber: phoneNumber,
          text: text,
          messageId: messageId
        });

        return res.status(200).json({ 
          success: true, 
          messageId: messageId
        });
      } else {
        throw new Error('Failed to send message - no message ID returned');
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar mensagem do agente para WhatsApp`);
      
      if (error.response) {
        const errorData = error.response.data;
        let errorMessage: string;
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.response?.message) {
          errorMessage = Array.isArray(errorData.response.message) 
            ? errorData.response.message.join(', ') 
            : String(errorData.response.message);
        } else if (errorData?.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : String(errorData.message);
        } else {
          errorMessage = JSON.stringify(errorData);
        }
        
        console.error(`[${errorTimestamp}]    Error: ${errorMessage}`);
        return res.status(500).json({ error: `Failed to send message: ${errorMessage}` });
      }
      
      if (error.code === 'ECONNREFUSED') {
        console.error(`[${errorTimestamp}]    Evolution API não está acessível`);
        return res.status(503).json({ error: 'Evolution API is not accessible' });
      }
      
      console.error(`[${errorTimestamp}]    Error: ${error.message}`);
      return res.status(500).json({ error: `Failed to send message: ${error.message}` });
    }
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Erro no endpoint /agent/message: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};
