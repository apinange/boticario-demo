import { Request, Response } from 'express';
import { webhookConfigService } from '../services/webhook-config.service';

export const setupWebhook = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  
  try {
    const { webhookUrl, instanceName } = req.body;
    
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl is required' });
    }
    
    console.log(`[${timestamp}] 📡 Setup webhook request received`);
    console.log(`[${timestamp}]    Webhook URL: ${webhookUrl}`);
    console.log(`[${timestamp}]    Instance Name: ${instanceName || 'default'}`);
    
    const result = await webhookConfigService.setupWebhook(webhookUrl, instanceName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error(`[${timestamp}] ❌ Error setting up webhook:`, error.message);
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
