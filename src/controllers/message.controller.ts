import { Request, Response } from 'express';
import { evolutionApiService } from '../services/evolution-api.service';

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, text } = req.body;
    
    if (!phoneNumber || !text) {
      return res.status(400).json({ error: 'phoneNumber and text are required' });
    }
    
    const messageId = await evolutionApiService.sendTextMessage(phoneNumber, text);
    
    res.json({ success: true, messageId });
  } catch (error: any) {
    if (error.message.includes('does not exist')) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Evolution API is not accessible' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

export const sendOCPMessage = async (req: Request, res: Response) => {
  try {
    const { phoneNumber, text } = req.body;
    
    if (!phoneNumber || !text) {
      return res.status(400).json({ error: 'phoneNumber and text are required' });
    }
    
    const messageId = await evolutionApiService.sendTextMessage(phoneNumber, text);
    
    res.json({ success: true, messageId, message: 'Message sent to WhatsApp (OCP initiated)' });
  } catch (error: any) {
    if (error.message.includes('does not exist')) {
      res.status(400).json({ error: error.message });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(503).json({ error: 'Evolution API is not accessible' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};
