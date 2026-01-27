import { Request, Response } from 'express';
import WebSocket from 'ws';
import { getOCPClient } from '../core/ocp-websocket';
import { config } from '../config/env.config';

export const getStatus = (req: Request, res: Response) => {
  try {
    const ocpClient = getOCPClient();
    const ws = (ocpClient as any).ws;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    res.json({
      status: 'ok',
      ocp: {
        connected: isConnected,
        url: config.ocpWsUrl,
        readyState: ws ? ws.readyState : 'NO_WEBSOCKET',
        sessionId: (ocpClient as any).sessionId || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
