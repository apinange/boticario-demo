import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhook';

async function setupWebhook(): Promise<void> {
  try {
    console.log(`🔧 Configuring webhook for instance "${INSTANCE_NAME}"...`);
    console.log(`📡 Webhook URL: ${WEBHOOK_URL}\n`);

    // Configure webhook for the instance
    const response = await axios.post(
      `${EVOLUTION_API_URL}/webhook/set/${INSTANCE_NAME}`,
      {
        webhook: {
          enabled: true,
          url: WEBHOOK_URL,
          webhookByEvents: true,
          webhookBase64: false,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_SET',
            'MESSAGES_UPDATE'
          ]
        }
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Webhook configured successfully!');
      console.log('\n📋 Webhook events enabled:');
      console.log('   - MESSAGES_UPSERT');
      console.log('   - MESSAGES_SET');
      console.log('   - MESSAGES_UPDATE');
      console.log('\n💡 Make sure the webhook server is running: npm run webhook');
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

if (require.main === module) {
  setupWebhook();
}

export { setupWebhook };

