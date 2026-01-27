import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

interface SendMessageRequest {
  phone_number: string;
  message: string;
}

async function sendMessage(request: SendMessageRequest): Promise<void> {
  const instance = INSTANCE_NAME;
  
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${instance}`,
      {
        number: request.phone_number,
        text: request.message
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    if (response.status === 201) {
      const messageId = response.data?.key?.id;
      console.log('✅ Message sent successfully!');
      console.log('Message ID:', messageId);
      return;
    }

    throw new Error(`Unexpected status: ${response.status}`);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const errorData = error.response.data;
        let errorMessage: string;
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.response?.message) {
          const msg = errorData.response.message;
          if (Array.isArray(msg)) {
            // Check if it's an array of objects with exists:false
            const existsCheck = msg.find((m: any) => m.exists === false);
            if (existsCheck) {
              errorMessage = `Number ${existsCheck.number} does not exist on WhatsApp or is not in the correct format.`;
            } else {
              errorMessage = msg.map((m: any) => typeof m === 'string' ? m : JSON.stringify(m)).join(', ');
            }
          } else {
            errorMessage = String(msg);
          }
        } else if (errorData?.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : String(errorData.message);
        } else {
          errorMessage = JSON.stringify(errorData);
        }
        
        throw new Error(`Failed to send message: ${errorMessage}`);
      }
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Evolution API at ${EVOLUTION_API_URL}. Make sure it's running.`);
      }
      if (error.code === 'ETIMEDOUT') {
        throw new Error(`Request timed out. The instance '${instance}' may not be connected.`);
      }
    }
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: tsx src/send-message.ts <phone_number> <message>');
    console.error('Example: tsx src/send-message.ts 5511999999999 "Hello!"');
    process.exit(1);
  }

  const [phone_number, message] = args;
  
  sendMessage({ phone_number, message })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

export { sendMessage };

