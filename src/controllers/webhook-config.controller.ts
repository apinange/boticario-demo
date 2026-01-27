import { Request, Response } from 'express';
import { webhookConfigService } from '../services/webhook-config.service';

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
