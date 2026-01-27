import { getOCPClient } from '../core/ocp-websocket';
import { getBotMode, isProactiveMode } from './bot-mode';
import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PHONE_NUMBER = process.env.DEFAULT_PHONE_NUMBER || '13688852974';

async function startConversation() {
  const timestamp = new Date().toISOString();
  const botMode = getBotMode();
  
  console.log(`\n🚀 Iniciando conversa no modo ${botMode.toUpperCase()}`);
  console.log(`[${timestamp}] Bot mode: ${botMode.toUpperCase()}`);
  
  if (!isProactiveMode()) {
    console.error(`\n❌ Erro: Este comando só funciona em modo PROACTIVE`);
    console.error(`   Modo atual: ${botMode.toUpperCase()}`);
    console.error(`   Use: npm run bot-mode proactive\n`);
    process.exit(1);
  }
  
  try {
    const ocpClient = getOCPClient();
    
    // Check if OCP is connected
    const isConnected = ocpClient.isOCPConnected();
    
    if (!isConnected) {
      console.error(`\n❌ OCP WebSocket não está conectado!`);
      console.error(`   Aguarde alguns segundos e tente novamente\n`);
      process.exit(1);
    }
    
    // Send an initial message to trigger OCP's welcome message
    // This simulates the user starting the conversation
    const initialMessage = 'oi';
    
    console.log(`[${timestamp}] 📤 Enviando mensagem inicial para OCP...`);
    console.log(`[${timestamp}]    Phone: ${DEFAULT_PHONE_NUMBER}`);
    console.log(`[${timestamp}]    Message: "${initialMessage}"`);
    console.log(`[${timestamp}]    Isso vai fazer o OCP enviar a mensagem de boas-vindas\n`);
    
    // Set flag to allow first message from OCP
    ocpClient.allowFirstMessageForPhone(DEFAULT_PHONE_NUMBER);
    
    // Send message to OCP (this will trigger the welcome message)
    ocpClient.sendMessageToOCP(DEFAULT_PHONE_NUMBER, initialMessage);
    
    // Wait a moment for the message to be sent
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`[${timestamp}] ✅ Mensagem inicial enviada!`);
    console.log(`[${timestamp}]    O OCP deve responder com a mensagem de boas-vindas em breve.\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Erro ao iniciar conversa: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  startConversation();
}

export { startConversation };

