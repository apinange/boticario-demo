import { Request, Response } from 'express';
import { getOCPClient } from '../core/ocp-websocket';
import { getBotMode, isProactiveMode } from '../features/bot-mode';
import { config } from '../config/env.config';

export const restartOCPSession = async (req: Request, res: Response) => {
  try {
    const ocpClient = getOCPClient();
    const botMode = getBotMode();
    
    const isConnected = ocpClient.isOCPConnected();
    
    if (!isConnected) {
      return res.status(400).json({ error: 'OCP WebSocket is not connected' });
    }
    
    ocpClient.restartSession();
    
    res.json({ 
      success: true, 
      message: 'OCP session restart initiated',
      botMode: botMode.toUpperCase()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const startConversation = async (req: Request, res: Response) => {
  try {
    const botMode = getBotMode();
    
    if (!isProactiveMode()) {
      return res.status(400).json({ 
        error: 'This endpoint only works in PROACTIVE mode',
        currentMode: botMode.toUpperCase()
      });
    }
    
    const ocpClient = getOCPClient();
    const isConnected = ocpClient.isOCPConnected();
    
    if (!isConnected) {
      return res.status(400).json({ error: 'OCP WebSocket is not connected' });
    }
    
    const initialMessage = 'oi';
    ocpClient.allowFirstMessageForPhone(config.defaultPhoneNumber);
    ocpClient.sendMessageToOCP(config.defaultPhoneNumber, initialMessage);
    
    res.json({ 
      success: true, 
      message: 'Initial message sent to OCP',
      phoneNumber: config.defaultPhoneNumber
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
