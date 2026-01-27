import { Request, Response } from 'express';
import WebSocket from 'ws';
import { getOCPClient } from '../core/ocp-websocket';
import { config } from '../config/env.config';

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Get system status
 *     description: Returns the current status of the system including OCP WebSocket connection
 *     tags: [Status]
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 ocp:
 *                   type: object
 *                   properties:
 *                     connected:
 *                       type: boolean
 *                     url:
 *                       type: string
 *                     readyState:
 *                       type: number
 *                     sessionId:
 *                       type: string
 *                       nullable: true
 *       500:
 *         description: Server error
 */
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
