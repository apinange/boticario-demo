import { Request, Response } from 'express';
import { setBotMode, getBotMode, BotMode } from '../features/bot-mode';
import { getOCPClient } from '../core/ocp-websocket';

export const getBotModeStatus = (req: Request, res: Response) => {
  try {
    const mode = getBotMode();
    res.json({ success: true, mode: mode.toUpperCase() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const setBotModeEndpoint = async (req: Request, res: Response) => {
  try {
    const { mode } = req.body;
    
    if (!mode) {
      return res.status(400).json({ error: 'mode is required (proactive or reactive)' });
    }
    
    const botMode = mode.toLowerCase() as BotMode;
    
    if (botMode !== 'proactive' && botMode !== 'reactive') {
      return res.status(400).json({ error: 'mode must be "proactive" or "reactive"' });
    }
    
    const currentMode = getBotMode();
    
    if (botMode === currentMode) {
      return res.json({ success: true, message: `Bot is already in ${botMode} mode`, mode: botMode.toUpperCase() });
    }
    
    setBotMode(botMode);
    
    // If switching to proactive, restart OCP session
    if (botMode === 'proactive') {
      const ocpClient = getOCPClient();
      ocpClient.restartSession();
    }
    
    res.json({ success: true, message: `Bot mode changed to ${botMode}`, mode: botMode.toUpperCase() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
