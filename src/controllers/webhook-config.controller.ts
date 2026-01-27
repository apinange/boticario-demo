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

export const getWebhook = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.query;
    const name = (instanceName as string) || undefined;
    
    const webhook = await webhookConfigService.getWebhook(name);
    
    if (!webhook) {
      return res.json({
        success: false,
        message: 'Webhook not configured',
        data: null
      });
    }
    
    res.json({
      success: true,
      message: 'Webhook found',
      data: webhook
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
