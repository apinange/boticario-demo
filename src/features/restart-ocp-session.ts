import { getOCPClient } from '../core/ocp-websocket';
import { getBotMode } from './bot-mode';

async function restartOCPSession() {
  const timestamp = new Date().toISOString();
  const botMode = getBotMode();
  
  console.log(`\n🔄 Reiniciando sessão OCP...`);
  console.log(`[${timestamp}] Bot mode atual: ${botMode.toUpperCase()}`);
  console.log(`[${timestamp}] O modo será mantido após a reinicialização\n`);
  
  try {
    const ocpClient = getOCPClient();
    
    // Check if OCP is connected
    const isConnected = ocpClient.isOCPConnected();
    
    if (!isConnected) {
      console.log(`⚠️  OCP WebSocket não está conectado.`);
      console.log(`   Tentando conectar...\n`);
    }
    
    // Restart session (this will disconnect, clear state, and reconnect)
    ocpClient.restartSession();
    
    console.log(`✅ Comando de reinicialização enviado!`);
    console.log(`   A sessão OCP será reiniciada mantendo o modo ${botMode.toUpperCase()}\n`);
    
    // Wait a bit to show the reconnection
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newTimestamp = new Date().toISOString();
    const stillConnected = ocpClient.isOCPConnected();
    
    if (stillConnected) {
      console.log(`[${newTimestamp}] ✅ Sessão OCP reiniciada com sucesso!`);
      console.log(`[${newTimestamp}]    Modo mantido: ${botMode.toUpperCase()}\n`);
    } else {
      console.log(`[${newTimestamp}] ⏳ Sessão OCP está reconectando...`);
      console.log(`[${newTimestamp}]    Verifique os logs do webhook server para confirmar a conexão\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Erro ao reiniciar sessão OCP: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  restartOCPSession();
}

export { restartOCPSession };

