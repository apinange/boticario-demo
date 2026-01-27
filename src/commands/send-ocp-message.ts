import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

/**
 * Send a message to WhatsApp when OCP initiates a conversation
 * This is useful when you want to start a conversation from OCP side
 */
async function sendOCPInitiatedMessage(phoneNumber: string, message: string): Promise<void> {
  try {
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
      {
        number: phoneNumber,
        text: message
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
      console.log(`✅ Message sent to WhatsApp (${phoneNumber}): ${message.substring(0, 50)}...`);
    }
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
    }
    throw error;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: tsx src/send-ocp-message.ts <phone_number> <message>');
    console.error('Example: tsx src/send-ocp-message.ts 5511983461478 "Hello from OCP!"');
    process.exit(1);
  }

  const [phoneNumber, message] = args;
  
  sendOCPInitiatedMessage(phoneNumber, message)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

export { sendOCPInitiatedMessage };

