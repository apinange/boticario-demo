import { Request, Response } from 'express';
import { messageProcessorService } from '../services/message-processor.service';
import { WebhookEvent } from '../types/message.types';

export const handleWebhook = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  
  try {
    const event = req.body as WebhookEvent;
    
    // Log webhook received (only for relevant events)
    if (event.event === 'MESSAGES_UPSERT' || event.event === 'MESSAGES_SET' || event.event === 'messages.upsert') {
      const messageData = Array.isArray(event.data) ? event.data : [event.data];
      if (messageData.length > 0) {
        console.log(`\n[${timestamp}] 📥 WEBHOOK RECEBIDO DA EVOLUTION API`);
        console.log(`[${timestamp}]    Event: ${event.event}`);
        console.log(`[${timestamp}]    Instance: ${event.instance || 'unknown'}`);
        console.log(`[${timestamp}]    Messages: ${messageData.length}`);
      }
    }
    
    // Process the webhook event
    await messageProcessorService.processWebhookEvent(event);
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error(`[${timestamp}] ❌ Webhook error:`, error.message);
    console.error(`[${timestamp}]    Stack:`, error.stack);
    res.status(500).json({ error: error.message });
  }
};
