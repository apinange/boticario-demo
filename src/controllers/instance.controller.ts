import { Request, Response } from 'express';
import { instanceService } from '../services/instance.service';

export const getInstances = async (req: Request, res: Response) => {
  try {
    const instances = await instanceService.fetchInstances();
    res.json({ success: true, instances, count: instances.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createInstance = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.body;
    const result = await instanceService.createInstance(instanceName);
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
};

export const getQrCode = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.query;
    const qrData = await instanceService.getQrCode(instanceName as string);
    
    if (qrData) {
      res.json({ success: true, qrCode: qrData.qrCode, base64: qrData.base64 });
    } else {
      res.status(404).json({ error: 'QR code not available yet' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const reconnectInstance = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.body;
    const qrData = await instanceService.reconnectInstance(instanceName);
    
    if (qrData) {
      res.json({ success: true, qrCode: qrData.qrCode, base64: qrData.base64 });
    } else {
      res.status(404).json({ error: 'QR code not available yet' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const logoutInstance = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.body;
    await instanceService.logoutInstance(instanceName);
    res.json({ success: true, message: 'Instance logged out successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
