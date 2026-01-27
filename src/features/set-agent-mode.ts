import { setAgentMode, getAgentModeNumbers, clearAllAgentModes, isInAgentMode } from './agent-mode';
import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_PHONE_NUMBER = process.env.DEFAULT_PHONE_NUMBER || '13688852974';

async function setAgentModeCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  const phoneNumber = args[1] || DEFAULT_PHONE_NUMBER;

  if (!command) {
    console.log(`\n📋 Uso: npm run agent-mode <comando> [número]`);
    console.log(`\nComandos disponíveis:`);
    console.log(`  enable [número]  - Ativa modo agente para um número`);
    console.log(`  disable [número] - Desativa modo agente para um número`);
    console.log(`  status [número] - Verifica se um número está em modo agente`);
    console.log(`  list             - Lista todos os números em modo agente`);
    console.log(`  clear            - Remove todos os números do modo agente`);
    console.log(`\nExemplos:`);
    console.log(`  npm run agent-mode enable`);
    console.log(`  npm run agent-mode disable`);
    console.log(`  npm run agent-mode disable 558184475278`);
    console.log(`  npm run agent-mode status`);
    console.log(`  npm run agent-mode list`);
    console.log(`  npm run agent-mode clear\n`);
    process.exit(0);
  }

  const timestamp = new Date().toISOString();

  switch (command.toLowerCase()) {
    case 'enable':
      if (isInAgentMode(phoneNumber)) {
        console.log(`\n[${timestamp}] ℹ️  Modo agente já está ATIVO para ${phoneNumber}\n`);
      } else {
        setAgentMode(phoneNumber, true);
        console.log(`\n[${timestamp}] ✅ Modo agente ATIVADO para ${phoneNumber}`);
        console.log(`[${timestamp}]    Mensagens deste número não serão enviadas para OCP`);
        console.log(`[${timestamp}]    Use POST /agent/message para enviar mensagens\n`);
      }
      break;

    case 'disable':
      if (!isInAgentMode(phoneNumber)) {
        console.log(`\n[${timestamp}] ℹ️  Modo agente já está DESATIVO para ${phoneNumber}\n`);
      } else {
        setAgentMode(phoneNumber, false);
        console.log(`\n[${timestamp}] ✅ Modo agente DESATIVADO para ${phoneNumber}`);
        console.log(`[${timestamp}]    Mensagens deste número voltarão a ser enviadas para OCP\n`);
      }
      break;

    case 'status':
      const isActive = isInAgentMode(phoneNumber);
      console.log(`\n[${timestamp}] 📋 Status do modo agente para ${phoneNumber}:`);
      console.log(`[${timestamp}]    ${isActive ? '✅ ATIVO' : '❌ DESATIVO'}\n`);
      break;

    case 'list':
      const numbers = getAgentModeNumbers();
      console.log(`\n[${timestamp}] 📋 Números em modo agente:`);
      if (numbers.length === 0) {
        console.log(`[${timestamp}]    Nenhum número em modo agente\n`);
      } else {
        numbers.forEach(num => {
          console.log(`[${timestamp}]    - ${num}`);
        });
        console.log(`\n`);
      }
      break;

    case 'clear':
      clearAllAgentModes();
      console.log(`\n[${timestamp}] ✅ Todos os modos agente foram removidos\n`);
      break;

    default:
      console.error(`\n❌ Comando inválido: ${command}`);
      console.error(`   Use: npm run agent-mode <enable|disable|status|list|clear>\n`);
      process.exit(1);
  }
}

if (require.main === module) {
  setAgentModeCLI();
}

export { setAgentModeCLI };

