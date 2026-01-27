import { Request, Response } from 'express';

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 service:
 *                   type: string
 *                   example: whatsapp-ocp-bridge
 */
export const getHealth = (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'whatsapp-ocp-bridge' });
};
