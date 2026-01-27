import * as fs from 'fs';
import * as path from 'path';

export type BotMode = 'proactive' | 'reactive';

const BOT_MODE_FILE = path.join(process.cwd(), 'bot-mode.json');

interface BotModeConfig {
  mode: BotMode;
  updatedAt: string;
}

const DEFAULT_MODE: BotMode = 'reactive';

/**
 * Get current bot mode
 */
export function getBotMode(): BotMode {
  try {
    if (fs.existsSync(BOT_MODE_FILE)) {
      const content = fs.readFileSync(BOT_MODE_FILE, 'utf-8');
      const config: BotModeConfig = JSON.parse(content);
      return config.mode || DEFAULT_MODE;
    }
  } catch (error: any) {
    console.error(`Error reading bot mode: ${error.message}`);
  }
  return DEFAULT_MODE;
}

/**
 * Set bot mode
 */
export function setBotMode(mode: BotMode): void {
  try {
    const config: BotModeConfig = {
      mode,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(BOT_MODE_FILE, JSON.stringify(config, null, 2));
  } catch (error: any) {
    throw new Error(`Error writing bot mode: ${error.message}`);
  }
}

/**
 * Check if bot is in proactive mode
 */
export function isProactiveMode(): boolean {
  return getBotMode() === 'proactive';
}

/**
 * Check if bot is in reactive mode
 */
export function isReactiveMode(): boolean {
  return getBotMode() === 'reactive';
}

