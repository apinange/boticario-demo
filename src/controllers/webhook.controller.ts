import { Request, Response } from 'express';
import { messageProcessorService } from '../services/message-processor.service';
import { WebhookEvent } from '../types/message.types';

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body as WebhookEvent;
    
    // Process the webhook event
    await messageProcessorService.processWebhookEvent(event);
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Webhook error:`, error.message);
    res.status(500).json({ error: error.message });
  }
};
