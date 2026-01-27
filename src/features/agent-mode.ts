import * as fs from 'fs';
import * as path from 'path';

const AGENT_MODE_FILE = path.join(process.cwd(), 'agent-mode.json');

interface AgentModeData {
  agentModeNumbers: string[]; // List of phone numbers in agent mode
}

/**
 * Read agent mode data from file
 */
function readAgentModeData(): AgentModeData {
  try {
    if (fs.existsSync(AGENT_MODE_FILE)) {
      const data = fs.readFileSync(AGENT_MODE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error: any) {
    console.error(`[AgentMode] Error reading agent mode file: ${error.message}`);
  }
  return { agentModeNumbers: [] };
}

/**
 * Write agent mode data to file
 */
function writeAgentModeData(data: AgentModeData): void {
  try {
    fs.writeFileSync(AGENT_MODE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error: any) {
    console.error(`[AgentMode] Error writing agent mode file: ${error.message}`);
  }
}

/**
 * Check if a phone number is in agent mode
 */
export function isInAgentMode(phoneNumber: string): boolean {
  const data = readAgentModeData();
  return data.agentModeNumbers.includes(phoneNumber);
}

/**
 * Set agent mode for a phone number
 */
export function setAgentMode(phoneNumber: string, enabled: boolean): void {
  const data = readAgentModeData();
  
  if (enabled) {
    if (!data.agentModeNumbers.includes(phoneNumber)) {
      data.agentModeNumbers.push(phoneNumber);
      writeAgentModeData(data);
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AgentMode] ✅ Modo agente ATIVADO para ${phoneNumber}`);
    }
  } else {
    const index = data.agentModeNumbers.indexOf(phoneNumber);
    if (index > -1) {
      data.agentModeNumbers.splice(index, 1);
      writeAgentModeData(data);
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AgentMode] ✅ Modo agente DESATIVADO para ${phoneNumber}`);
    }
  }
}

/**
 * Get all phone numbers in agent mode
 */
export function getAgentModeNumbers(): string[] {
  const data = readAgentModeData();
  return [...data.agentModeNumbers];
}

/**
 * Clear agent mode for all numbers
 */
export function clearAllAgentModes(): void {
  writeAgentModeData({ agentModeNumbers: [] });
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [AgentMode] ✅ Todos os modos agente foram limpos`);
}

