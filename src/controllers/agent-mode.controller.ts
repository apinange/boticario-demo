import { Request, Response } from 'express';
import { setAgentMode, getAgentModeNumbers, clearAllAgentModes, isInAgentMode } from '../features/agent-mode';
import { config } from '../config/env.config';

export const getAgentModeStatus = (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.query;
    const number = (phoneNumber as string) || config.defaultPhoneNumber;
    const isActive = isInAgentMode(number);
    
    res.json({ 
      success: true, 
      phoneNumber: number,
      agentMode: isActive 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const listAgentModes = (req: Request, res: Response) => {
  try {
    const numbers = getAgentModeNumbers();
    res.json({ success: true, numbers, count: numbers.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const enableAgentMode = (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    const number = phoneNumber || config.defaultPhoneNumber;
    
    if (isInAgentMode(number)) {
      return res.json({ success: true, message: `Agent mode already enabled for ${number}`, phoneNumber: number });
    }
    
    setAgentMode(number, true);
    res.json({ success: true, message: `Agent mode enabled for ${number}`, phoneNumber: number });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const disableAgentMode = (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    const number = phoneNumber || config.defaultPhoneNumber;
    
    if (!isInAgentMode(number)) {
      return res.json({ success: true, message: `Agent mode already disabled for ${number}`, phoneNumber: number });
    }
    
    setAgentMode(number, false);
    res.json({ success: true, message: `Agent mode disabled for ${number}`, phoneNumber: number });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const clearAllAgentModesEndpoint = (req: Request, res: Response) => {
  try {
    clearAllAgentModes();
    res.json({ success: true, message: 'All agent modes cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
