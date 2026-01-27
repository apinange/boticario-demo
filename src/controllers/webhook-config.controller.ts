import { Request, Response } from 'express';
import { webhookConfigService } from '../services/webhook-config.service';

export const setupWebhook = async (req: Request, res: Response) => {
  try {
    const { webhookUrl, instanceName } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }
    
    const result = await webhookConfigService.setupWebhook(webhookUrl, instanceName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
