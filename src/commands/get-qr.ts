import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

async function getQrCode(): Promise<void> {
  const instanceName = INSTANCE_NAME;
  try {
    // First, try to disconnect if already connected
    try {
      await axios.delete(
        `${EVOLUTION_API_URL}/instance/logout/${instanceName}`,
        {
          headers: {
            apikey: EVOLUTION_API_KEY
          },
          timeout: 10000
        }
      );
      console.log('🔄 Disconnected instance to generate new QR code...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      // Ignore errors - instance might not be connected
    }

    // Now connect to get QR code
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/connect/${instanceName}?qrcode=true`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY
        },
        timeout: 30000
      }
    );

    if (response.status === 200) {
      const data = response.data;
      
      // Extract QR code from response
      let qrCode: string | null = null;
      
      // Check for base64 field (may include data:image/png;base64, prefix)
      if (data.base64) {
        const base64Str = typeof data.base64 === 'string' ? data.base64 : data.base64.toString();
        // Remove data:image/png;base64, prefix if present
        qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
      } else if (data.code) {
        // Sometimes the QR code is in the 'code' field directly
        qrCode = typeof data.code === 'string' ? data.code : data.code.toString();
      } else if (data.qrcode) {
        if (typeof data.qrcode === 'string') {
          qrCode = data.qrcode;
        } else if (data.qrcode.base64) {
          const base64Str = typeof data.qrcode.base64 === 'string' ? data.qrcode.base64 : data.qrcode.base64.toString();
          qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
        } else if (data.qrcode.code) {
          qrCode = data.qrcode.code;
        }
      }

      if (qrCode) {
        console.log('\n✅ QR Code generated!\n');
        console.log('📱 Scan this QR code with WhatsApp:');
        console.log('   1. Open WhatsApp on your phone');
        console.log('   2. Go to Settings > Linked Devices');
        console.log('   3. Tap "Link a Device"');
        console.log('   4. Scan the QR code below\n');
        
        // Save QR code as image file
        const qrImagePath = path.join(process.cwd(), `qr-${instanceName}.png`);
        const imageBuffer = Buffer.from(qrCode, 'base64');
        fs.writeFileSync(qrImagePath, imageBuffer);
        
        console.log(`💾 QR code saved to: ${qrImagePath}`);
        console.log(`📋 Or open in browser: data:image/png;base64,${qrCode.substring(0, 50)}...\n`);
        
        // Try to open the image (macOS)
        if (process.platform === 'darwin') {
          require('child_process').exec(`open ${qrImagePath}`, () => {});
          console.log('🖼️  Opening QR code image...\n');
        }
      } else {
        console.log('⚠️  QR code not available yet.');
        console.log('Instance status:', data.instance?.status || 'unknown');
        console.log('\n💡 Try again in a few seconds, or check if instance is already connected.');
      }
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.response?.message || errorData?.message || `HTTP ${error.response.status}`;
        console.error(`❌ Error: ${errorMessage}`);
      } else if (error.code === 'ECONNREFUSED') {
        console.error(`❌ Cannot connect to Evolution API at ${EVOLUTION_API_URL}`);
        console.error('Make sure Evolution API is running.');
      } else {
        console.error('❌ Error:', error.message);
      }
    } else {
      console.error('❌ Error:', error);
    }
    process.exit(1);
  }
}

// CLI usage
if (require.main === module) {
  getQrCode();
}

export { getQrCode };

