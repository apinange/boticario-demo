import { setBotMode, getBotMode, BotMode } from './bot-mode';
import { getOCPClient } from '../core/ocp-websocket';

async function setBotModeCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    const currentMode = getBotMode();
    console.log(`\n📊 Bot Mode: ${currentMode.toUpperCase()}`);
    console.log(`\nUsage: npx tsx src/set-bot-mode.ts <proactive|reactive>`);
    console.log(`\n  proactive - Bot sends first message automatically when OCP session starts`);
    console.log(`  reactive  - Bot waits for user message before responding\n`);
    process.exit(0);
  }

  const mode = args[0].toLowerCase() as BotMode;

  if (mode !== 'proactive' && mode !== 'reactive') {
    console.error(`❌ Invalid mode: ${mode}`);
    console.error(`   Valid modes: proactive, reactive`);
    process.exit(1);
  }

  const currentMode = getBotMode();
  
  if (mode === currentMode) {
    console.log(`\nℹ️  Bot is already in ${mode} mode\n`);
    process.exit(0);
  }

  try {
    setBotMode(mode);
    const timestamp = new Date().toISOString();
    console.log(`\n✅ Bot mode changed to: ${mode.toUpperCase()}`);
    console.log(`[${timestamp}] Mode updated\n`);

    // If switching modes, we may need to restart OCP session
    if (mode === 'proactive') {
      console.log(`🔄 Switching to PROACTIVE mode...`);
      console.log(`   The bot will now send the first message when OCP session starts.`);
      console.log(`   Restarting OCP session to apply changes...\n`);
      
      const ocpClient = getOCPClient();
      ocpClient.restartSession();
      console.log(`✅ OCP session restarted. Bot is now PROACTIVE.\n`);
    } else {
      console.log(`🔄 Switching to REACTIVE mode...`);
      console.log(`   The bot will now wait for user messages before responding.`);
      console.log(`   Current OCP session will continue, but no automatic messages will be sent.`);
      console.log(`   User messages will enable OCP responses.\n`);
    }
  } catch (error: any) {
    console.error(`❌ Error setting bot mode: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  setBotModeCLI();
}

export { setBotModeCLI };

