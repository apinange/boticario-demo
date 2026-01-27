import { Request, Response } from 'express';
import { instanceService } from '../services/instance.service';

/**
 * @swagger
 * /api/instances:
 *   get:
 *     summary: Get all WhatsApp instances
 *     description: Returns a list of all WhatsApp instances configured in Evolution API
 *     tags: [Instance]
 *     responses:
 *       200:
 *         description: List of instances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 instances:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Instance'
 *                 count:
 *                   type: number
 *       500:
 *         description: Server error
 */
export const getInstances = async (req: Request, res: Response) => {
  try {
    const instances = await instanceService.fetchInstances();
    res.json({ success: true, instances, count: instances.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * @swagger
 * /api/instances:
 *   post:
 *     summary: Create a new WhatsApp instance
 *     description: Creates a new WhatsApp instance in Evolution API
 *     tags: [Instance]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *                 description: Name of the instance (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: Instance created successfully
 *       409:
 *         description: Instance already exists
 *       500:
 *         description: Server error
 */
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

/**
 * @swagger
 * /api/instances/qr:
 *   get:
 *     summary: Get QR code for instance
 *     description: Generates and returns a QR code for connecting WhatsApp to the instance
 *     tags: [Instance]
 *     parameters:
 *       - in: query
 *         name: instanceName
 *         schema:
 *           type: string
 *         description: Name of the instance (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: QR code data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QrCode'
 *       404:
 *         description: QR code not available yet
 *       500:
 *         description: Server error
 */
export const getQrCode = async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.query;
    const name = (instanceName as string) || undefined;
    
    // First, check if instance exists, if not, create it
    try {
      const instances = await instanceService.fetchInstances();
      const instanceExists = instances.some((inst: any) => 
        inst.instance?.instanceName === name || 
        inst.instanceName === name ||
        (!name && (inst.instance?.instanceName === 'default' || inst.instanceName === 'default'))
      );
      
      if (!instanceExists) {
        console.log(`[${new Date().toISOString()}] ℹ️  Instance "${name || 'default'}" not found, creating it...`);
        await instanceService.createInstance(name);
        // Wait a bit for instance to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (createError: any) {
      // If instance already exists, that's fine, continue
      if (!createError.message.includes('already exists')) {
        console.error(`[${new Date().toISOString()}] ⚠️  Error checking/creating instance:`, createError.message);
      }
    }
    
    // Now get QR code
    const qrData = await instanceService.getQrCode(name);
    
    if (qrData) {
      res.json({ success: true, qrCode: qrData.qrCode, base64: qrData.base64 });
    } else {
      res.status(404).json({ error: 'QR code not available yet. Please try again in a few seconds.' });
    }
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] ❌ Error getting QR code:`, error.message);
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
