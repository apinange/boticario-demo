import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

async function createInstance(): Promise<void> {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/instance/create`,
      {
        instanceName: INSTANCE_NAME,
        token: INSTANCE_NAME,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (response.status === 200 || response.status === 201) {
      console.log(`✅ Instance "${INSTANCE_NAME}" created successfully!`);
      console.log('📱 Now run: npm run qr');
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.response?.message || errorData?.message || `HTTP ${error.response.status}`;
        
        if (errorMessage.includes('already exists') || error.response.status === 409) {
          console.log(`ℹ️  Instance "${INSTANCE_NAME}" already exists.`);
          console.log('📱 Run: npm run qr to get the QR code');
        } else {
          console.error(`❌ Error: ${errorMessage}`);
        }
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

if (require.main === module) {
  createInstance();
}

export { createInstance };

