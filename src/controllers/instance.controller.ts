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
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, image, png]
 *         description: Response format - 'json' returns JSON with base64, 'image' or 'png' returns PNG image directly
 *         default: json
 *     responses:
 *       200:
 *         description: QR code data (JSON) or PNG image
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QrCode'
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: QR code not available yet
 *       500:
 *         description: Server error
 */
export const getQrCodeImage = async (req: Request, res: Response) => {
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
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (createError: any) {
      if (!createError.message.includes('already exists')) {
        console.error(`[${new Date().toISOString()}] ⚠️  Error checking/creating instance:`, createError.message);
      }
    }
    
    // Get QR code
    const qrData = await instanceService.getQrCode(name);
    
    if (qrData) {
      try {
        // Use qrCode (raw base64) or extract from base64 data URL
        const base64Data = qrData.qrCode || qrData.base64.replace(/^data:image\/png;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'inline; filename="qr-code.png"');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(imageBuffer);
      } catch (bufferError: any) {
        console.error(`[${new Date().toISOString()}] ❌ Error converting base64 to image:`, bufferError.message);
        return res.status(500).json({ error: 'Failed to convert QR code to image' });
      }
    } else {
      res.status(404).json({ error: 'QR code not available yet. Please try again in a few seconds.' });
    }
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] ❌ Error getting QR code image:`, error.message);
    res.status(500).json({ error: error.message });
  }
};

export const getQrCode = async (req: Request, res: Response) => {
  try {
    const { instanceName, format } = req.query;
    const name = (instanceName as string) || undefined;
    const returnImage = format === 'image' || format === 'png';
    
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
      // If format=image, return the image directly
      if (returnImage) {
        try {
          // Use qrCode (raw base64) or extract from base64 data URL
          const base64Data = qrData.qrCode || qrData.base64.replace(/^data:image\/png;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Content-Disposition', 'inline; filename="qr-code.png"');
          res.setHeader('Cache-Control', 'no-cache');
          return res.send(imageBuffer);
        } catch (bufferError: any) {
          console.error(`[${new Date().toISOString()}] ❌ Error converting base64 to image:`, bufferError.message);
          // Fallback to JSON if image conversion fails
          res.json({ success: true, qrCode: qrData.qrCode, base64: qrData.base64 });
        }
      } else {
        // Return JSON
        res.json({ success: true, qrCode: qrData.qrCode, base64: qrData.base64 });
      }
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
    // Accept instanceName from query parameter or body
    const instanceName = (req.query.instanceName as string) || req.body?.instanceName || undefined;
    await instanceService.logoutInstance(instanceName);
    res.json({ success: true, message: `Instance "${instanceName || 'default'}" logged out successfully` });
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] ❌ Error logging out instance:`, error.message);
    res.status(500).json({ error: error.message });
  }
};
