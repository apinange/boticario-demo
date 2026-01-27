import WebSocket from 'ws';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { getMessageLogger } from './message-logger';
import { getBotMode, isReactiveMode } from '../features/bot-mode';
import { botMessageTracker } from '../utils/bot-message-tracker';
import { setAgentMode, isInAgentMode } from '../features/agent-mode';
import { evolutionApiService } from '../services/evolution-api.service';

// Load environment variables from .env file
dotenv.config();

const EVOLUTION_API_URL = process.env.SERVER_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.AUTHENTICATION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';
const OCP_WS_URL = process.env.OCP_WS_URL || 'wss://us1-m.ocp.ai/chat/ws/session';
const OCP_API_KEY = process.env.OCP_API_KEY || 'eyJhcHBsaWNhdGlvbl91dWlkIjogInVib2d0MDZBVVBUZWhLWWZJU2UxUG1oYXdHdkJvazRRTmM3SyIsImFjY2Vzc19rZXkiOiIzWmppT3YwUmZ6NVcyY1lrUmFHRFcxRFY3RUR5a2NKcTUzQW1qQzFkTU1lQkFCRk4xRENMSllNdUlicEs5NWxUcDJabnBhcVZBSFgxWUJiSVUweUE2SUpKdXRPSUEzSkFSUmx0In0=';
// Default phone number (user/client) - receives messages from OCP when session mapping is not found
// Format: 558184475278 (Brazil - +55 81 8447-5278)
const DEFAULT_PHONE_NUMBER = process.env.DEFAULT_PHONE_NUMBER || '13688852974';

// Bot phone number - the WhatsApp number connected to the instance (sends messages)
// Format: 5511983461478 (Brazil - +55 11 98346-1478)
const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || '5511983461478';

// Keywords that trigger catalog sending (in OCP responses)
const CATALOG_KEYWORDS = ['promoção', 'promocao', 'perfumes', 'masculinos', 'masculino', 'catálogo', 'catalogo', 'perfumaria'];

// Check if message contains catalog keywords
function shouldSendCatalog(text: string): boolean {
  const lowerText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
  return CATALOG_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

// Clean CPF and other formatted numbers from text
// Removes formatting (dots, hyphens, spaces) from CPF patterns while keeping the context
function cleanFormattedNumbers(text: string): string {
  // Pattern to match CPF formats:
  // - XXX.XXX.XXX-XX (Brazilian CPF)
  // - X-XXX-XXX-XXXX (US SSN format)
  // - XXX-XXX-XXXX (US phone format)
  // - Any sequence of digits with dots, hyphens, or spaces
  
  // Match patterns like: "CPF é 123.456.789-00" or "Meu CPF é 1-234-567-8900"
  // This regex finds sequences of digits separated by dots, hyphens, or spaces
  const formattedNumberPattern = /(\d+[.\-\s]+)+\d+/g;
  
  return text.replace(formattedNumberPattern, (match) => {
    // Remove all non-digit characters from the match
    const cleaned = match.replace(/\D/g, '');
    // Replace the formatted number with the cleaned version in the original text
    // We need to find where this match appears in the text and replace it
    return cleaned;
  });
}

interface OCPMessage {
  api_key: string;
  client_message_id: string;
  input_fields: Record<string, any> | null;
  semantics: any;
  session_id: string | null;
  type: string;
  utterance: string;
}

interface WhatsAppMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageTimestamp: number;
}

// Queue item types
type QueueItemType = 'text' | 'catalog';

interface QueueItem {
  type: QueueItemType;
  phoneNumber: string;
  text?: string;
  timestamp: number;
}

class OCPWebSocketClient {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private phoneSessions: Map<string, string> = new Map(); // phoneNumber -> sessionId
  private sessionPhones: Map<string, string> = new Map(); // sessionId -> phoneNumber (reverse mapping)
  private messageQueue: Map<string, { phoneNumber: string; timestamp: number }> = new Map();
  private sendQueues: Map<string, QueueItem[]> = new Map(); // phoneNumber -> queue of messages to send
  private processingQueues: Map<string, boolean> = new Map(); // phoneNumber -> is processing queue
  private reconnectInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private sessionInvalidated = false; // Flag to track if session was invalidated by OCP
  private helpMessageCounters: Map<string, number> = new Map(); // phoneNumber -> count of "Como posso ajudá-lo hoje?" messages
  private lastUserMessageTimestamps: Map<string, number> = new Map(); // phoneNumber -> timestamp of last user message
  private userHasMessaged: Map<string, boolean> = new Map(); // phoneNumber -> has user sent a message (for reactive mode)
  private isRestarting = false; // Flag to prevent multiple simultaneous restarts
  private allowFirstMessageAfterRestart: Map<string, boolean> = new Map(); // phoneNumber -> allow first message after restart (even in reactive mode)
  private pingInterval: NodeJS.Timeout | null = null; // Interval for periodic ping to keep connection alive
  private pingCount = 0; // Counter for ping logs (to reduce verbosity)
  private readonly PING_INTERVAL_MS = 30000; // 30 seconds - ping every 30s to keep connection alive

  constructor() {
    if (!OCP_WS_URL || OCP_WS_URL === 'wss://your-ocp-endpoint.com') {
      const timestamp = new Date().toISOString();
      console.error(`\n${'='.repeat(80)}`);
      console.error(`[${timestamp}] ❌ ERRO: OCP_WS_URL não configurado!`);
      console.error(`[${timestamp}]    Configure a variável OCP_WS_URL no .env`);
      console.error(`[${timestamp}]    Exemplo: OCP_WS_URL=wss://seu-endpoint-ocp.com`);
      console.error(`${'='.repeat(80)}\n`);
      return;
    }
    
    this.connect();
  }

  private connect(): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔌 Connecting to OCP WebSocket...`);
    console.log(`[${timestamp}]    URL: ${OCP_WS_URL}`);

    try {
      this.ws = new WebSocket(OCP_WS_URL);

            this.ws.on('open', () => {
              const timestamp = new Date().toISOString();
              const botMode = getBotMode();
              console.log(`[${timestamp}] ✅ Connected to OCP WebSocket`);
              console.log(`[${timestamp}]    URL: ${OCP_WS_URL}`);
              console.log(`[${timestamp}]    Bot mode: ${botMode.toUpperCase()}`);
              this.isConnecting = false;
              
              // Start periodic ping to keep connection alive
              this.startPingInterval();
              
              // Only send start_session_req if we don't have an existing session OR if session was invalidated
              if (!this.sessionId || this.sessionInvalidated) {
                if (this.sessionInvalidated) {
                  console.log(`[${timestamp}] 🔄 Sessão foi invalidada anteriormente, criando nova sessão...`);
                  this.sessionInvalidated = false; // Reset flag
                }
                this.sendStartSession();
              } else {
                console.log(`[${timestamp}] ℹ️  Using existing session: ${this.sessionId}`);
              }
            });

      this.ws.on('message', (data: WebSocket.Data) => {
        const timestamp = new Date().toISOString();
        console.log(`\n${'='.repeat(80)}`);
        console.log(`[${timestamp}] 📥 RECEBENDO MENSAGEM DO OCP`);
        console.log(`${'='.repeat(80)}`);
        this.handleOCPResponse(data.toString());
      });

      this.ws.on('error', (error: Error) => {
        const timestamp = new Date().toISOString();
        console.error(`\n[${timestamp}] ❌ ERRO no WebSocket do OCP:`);
        console.error(`[${timestamp}]    Mensagem: ${error.message}`);
        console.error(`[${timestamp}]    URL: ${OCP_WS_URL}`);
        console.error(`[${timestamp}]    Verifique se a URL está correta e se o OCP está acessível\n`);
        this.isConnecting = false;
        this.scheduleReconnect();
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        const timestamp = new Date().toISOString();
        const reasonStr = reason.toString();
        console.log(`\n[${timestamp}] 🔌 WebSocket do OCP fechado`);
        console.log(`[${timestamp}]    Code: ${code}`);
        console.log(`[${timestamp}]    Reason: ${reasonStr || 'N/A'}\n`);
        
        // Stop ping interval when connection closes
        this.stopPingInterval();
        
        // Only clear session if OCP explicitly says "no session established"
        // Code 1000 with "no session established" means the session was invalidated
        // Code 1006 is abnormal closure (network issue) - keep session
        if (code === 1000 && reasonStr.includes('no session established')) {
          const clearTimestamp = new Date().toISOString();
          console.log(`[${clearTimestamp}] 🔄 Sessão invalidada pelo OCP. Limpando sessionId e mapeamentos...`);
          const oldSessionId = this.sessionId;
          this.sessionId = null;
          this.phoneSessions.clear();
          this.sessionPhones.clear();
          this.sessionInvalidated = true; // Mark that session was invalidated
          console.log(`[${clearTimestamp}]    SessionId anterior: ${oldSessionId || 'N/A'}`);
          console.log(`[${clearTimestamp}]    Nova sessão será criada na reconexão\n`);
        } else {
          // For other close reasons (network issues, timeouts, etc.), keep the session
          // The session might still be valid on the OCP side
          const keepTimestamp = new Date().toISOString();
          console.log(`[${keepTimestamp}] ℹ️  WebSocket fechado mas mantendo sessão (pode ser reconectado)`);
          console.log(`[${keepTimestamp}]    SessionId: ${this.sessionId || 'N/A'}`);
          console.log(`[${keepTimestamp}]    Tentando reconectar com sessão existente...\n`);
          // Don't mark as invalidated for network issues
          this.sessionInvalidated = false;
        }
        
        this.isConnecting = false;
        this.scheduleReconnect();
      });
    } catch (error: any) {
      console.error('❌ Failed to create WebSocket connection:', error.message);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectInterval) {
      return;
    }

    console.log('🔄 Scheduling reconnect in 5 seconds...');
    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      this.connect();
    }, 5000);
  }

  private sendStartSession(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ⚠️  Cannot send start_session_req - WebSocket not open`);
      return;
    }

    // Don't send start_session_req if we already have a session
    if (this.sessionId) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ℹ️  Session already exists: ${this.sessionId}. Not sending start_session_req.`);
      return;
    }

    const clientMessageId = this.generateClientMessageId();
    const message: OCPMessage = {
      api_key: OCP_API_KEY,
      client_message_id: clientMessageId,
      input_fields: null,
      semantics: null,
      session_id: null,
      type: 'start_session_req',
      utterance: ''
    };

    const timestamp = new Date().toISOString();
    console.log(`\n[${timestamp}] 📤 ENVIANDO start_session_req PARA OCP`);
    console.log(`[${timestamp}]    Payload:`, JSON.stringify(message, null, 2));
    console.log(`${'='.repeat(80)}\n`);
    this.ws.send(JSON.stringify(message));
  }

  public sendMessageToOCP(phoneNumber: string, text: string): void {
    // Validate phone number first
    if (!this.isValidPhoneNumber(phoneNumber)) {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] ❌ Número de telefone inválido: ${phoneNumber}`);
      console.error(`[${timestamp}]    Mensagem não será enviada para OCP`);
      return;
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket not connected. Message queued.');
      // Could implement a queue here
      return;
    }

    const clientMessageId = this.generateClientMessageId();
    
    // Get or use global session_id - use existing session if available
    let sessionId = this.phoneSessions.get(phoneNumber) || this.sessionId;
    
    // Only send start_session_req if we don't have a session at all
    if (!sessionId) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ⚠️  No OCP session found. Sending start_session_req...`);
      this.sendStartSession();
      // Wait a bit for session to be established, then use it
      setTimeout(() => {
        sessionId = this.sessionId;
        if (sessionId) {
          this.sendDialogRequest(phoneNumber, text, sessionId, clientMessageId);
        } else {
          console.error(`[${new Date().toISOString()}] ❌ Failed to establish session. Message not sent.`);
        }
      }, 1000);
      return;
    }
    
    // Send message using existing session
    this.sendDialogRequest(phoneNumber, text, sessionId, clientMessageId);
  }

  private sendDialogRequest(phoneNumber: string, text: string, sessionId: string, clientMessageId: string): void {
    // Clean formatted numbers (CPF, etc.) from text before sending to OCP
    const cleanedText = cleanFormattedNumbers(text);
    
    // Log if text was modified
    if (cleanedText !== text) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🔧 Limpando formatação de números:`);
      console.log(`[${timestamp}]    Original: "${text}"`);
      console.log(`[${timestamp}]    Limpo: "${cleanedText}"`);
    }
    
    // Send as dialog_req (user message from WhatsApp to OCP)
    const message: OCPMessage = {
      api_key: OCP_API_KEY,
      client_message_id: clientMessageId,
      input_fields: null,
      semantics: null,
      session_id: sessionId,
      type: 'dialog_req',
      utterance: cleanedText
    };

    // Store mapping to send response back to correct phone number
    this.messageQueue.set(clientMessageId, {
      phoneNumber,
      timestamp: Date.now()
    });

          // Update session mappings (only if phone number is valid)
          if (sessionId) {
            this.setSessionMapping(phoneNumber, sessionId);
          }

    const timestamp = new Date().toISOString();
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[${timestamp}] 📤 ENVIANDO MENSAGEM PARA OCP`);
    console.log(`${'='.repeat(80)}`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    console.log(`[${timestamp}]    Session ID: ${sessionId || 'N/A'}`);
    console.log(`[${timestamp}]    Client Message ID: ${clientMessageId}`);
    console.log(`[${timestamp}]    Message: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    console.log(`[${timestamp}]    Payload:`, JSON.stringify(message, null, 2));
    console.log(`${'='.repeat(80)}\n`);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error(`[${timestamp}] ❌ WebSocket não está conectado. Mensagem não enviada.`);
    }
  }

  private async handleOCPResponse(data: string): Promise<void> {
    try {
      const response = JSON.parse(data);
      
      const timestamp = new Date().toISOString();
      console.log(`\n[${timestamp}] 📋 DADOS COMPLETOS RECEBIDOS DO OCP:`);
      console.log(JSON.stringify(response, null, 2));
      console.log(`[${timestamp}] Tipo da mensagem: ${response.type || 'unknown'}\n`);

      // Handle session start response
      if (response.type === 'start_session_resp') {
        if (response.session_id) {
          this.sessionId = response.session_id;
          const timestamp = new Date().toISOString();
          const botMode = getBotMode();
          console.log(`\n[${timestamp}] ✅ OCP SESSION INICIADA COM SUCESSO!`);
          console.log(`[${timestamp}]    Session ID: ${this.sessionId}`);
          console.log(`[${timestamp}]    Agora podemos enviar e receber mensagens do OCP`);
          console.log(`[${timestamp}]    Bot mode: ${botMode.toUpperCase()}`);
          console.log(`[${timestamp}]    Use 'npm run start-conversation' para iniciar a conversa\n`);
        } else {
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] ⚠️  start_session_resp recebido mas sem session_id`);
        }
        return;
      }

      // Handle error events from OCP
      if (response.type === 'error_event') {
        const timestamp = new Date().toISOString();
        const errorCode = response.error_code || 'UNKNOWN';
        const errorMessage = response.error_message || response.message || 'Unknown error';
        
        console.error(`\n[${timestamp}] ❌ ERRO DO OCP`);
        console.error(`[${timestamp}]    Error Code: ${errorCode}`);
        console.error(`[${timestamp}]    Error Message: ${errorMessage}`);
        console.error(`[${timestamp}]    Session ID: ${response.session_id || 'N/A'}`);
        console.error(`[${timestamp}]    Client Message ID: ${response.client_message_id || 'N/A'}`);
        
        // Handle DIALOG_NOT_FOUND - session expired or invalidated
        if (errorCode === 'DIALOG_NOT_FOUND' || errorCode === 'SESSION_NOT_FOUND' || errorCode === 'SESSION_EXPIRED') {
          console.error(`[${timestamp}] 🔄 Sessão OCP expirada ou inválida (${errorCode}). Reiniciando sessão automaticamente...`);
          console.error(`[${timestamp}]    Session ID: ${response.session_id || this.sessionId || 'N/A'}`);
          
          // Restart session (this will clear state and reconnect)
          this.restartSession();
          
          console.log(`[${timestamp}] ✅ Comando de reinicialização enviado. Nova sessão será criada.\n`);
        } else {
          // Other errors - log but don't restart
          console.error(`[${timestamp}] ⚠️  Erro não crítico (${errorCode}). Continuando com a sessão atual.\n`);
        }
        return;
      }

      // Handle dialog_message_event (OCP dialog responses)
      if (response.type === 'dialog_message_event') {
        const timestamp = new Date().toISOString();
        console.log(`\n[${timestamp}] 💬 OCP Dialog Message Event detectado`);
        console.log(`[${timestamp}]    Action Type: ${response.action_type || 'N/A'}`);
        console.log(`[${timestamp}]    Source: ${response.source || 'N/A'}`);
        console.log(`[${timestamp}]    Sequence ID: ${response.sequence_id || 'N/A'}`);
        
        // Skip messages with source: "USER" - these are just echoes/confirmations of messages we sent
        if (response.source === 'USER') {
          console.log(`[${timestamp}] ⏭️  Ignorando mensagem com source: USER (é apenas confirmação/eco da mensagem enviada)`);
          return;
        }
        
        // Extract message from dialog_response.prompt.content or ui_component
        let utterance = '';
        if (response.dialog_response?.prompt?.content) {
          utterance = response.dialog_response.prompt.content;
        } else if (response.dialog_response?.ui_component) {
          // Handle UI components (buttons, etc.) - format as text
          const uiComponent = response.dialog_response.ui_component;
          if (uiComponent.title) {
            utterance = uiComponent.title;
          }
          if (uiComponent.options && uiComponent.options.length > 0) {
            const options = uiComponent.options.map((opt: any) => opt.label || opt.text).join('\n• ');
            utterance = utterance ? `${utterance}\n\n• ${options}` : options;
          }
        } else if (response.utterance) {
          utterance = response.utterance;
        } else if (response.text) {
          utterance = response.text;
        }
        
        if (!utterance.trim()) {
          console.log(`[${timestamp}] ⚠️  Mensagem vazia no dialog_message_event, ignorando...`);
          console.log(`[${timestamp}]    Dialog response:`, JSON.stringify(response.dialog_response, null, 2));
          return;
        }
        
        // Process all dialog_message_event types (ANNOUNCEMENT, ASK, etc.)
        // Don't skip any messages from the bot
        
        const responseSessionId = response.session_id || this.sessionId;
        let phoneNumber: string | null = null;
        
        console.log(`[${timestamp}]    Session ID recebido: ${responseSessionId || 'N/A'}`);
        console.log(`[${timestamp}]    Message: "${utterance}"`);
        console.log(`[${timestamp}]    Sessões mapeadas:`, Array.from(this.sessionPhones.entries()));
        console.log(`[${timestamp}]    Global sessionId: ${this.sessionId || 'N/A'}`);
        
        // Try to find phone number from session_id
        if (responseSessionId && this.sessionPhones.has(responseSessionId)) {
          phoneNumber = this.sessionPhones.get(responseSessionId)!;
          console.log(`[${timestamp}] ✅ Número encontrado pelo session_id: ${phoneNumber}`);
        } else if (this.sessionPhones.size === 1) {
          // Only one active session, use it
          phoneNumber = Array.from(this.sessionPhones.values())[0];
          const activeSessionId = Array.from(this.sessionPhones.keys())[0];
          console.log(`[${timestamp}] ✅ Usando única sessão ativa`);
          console.log(`[${timestamp}]    Active Session ID: ${activeSessionId}`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          
          // Update mapping if we got a new session_id (only if phone number is valid)
          if (responseSessionId && responseSessionId !== activeSessionId) {
            if (this.setSessionMapping(phoneNumber, responseSessionId)) {
              console.log(`[${timestamp}] 🔄 Atualizado mapeamento: ${responseSessionId} -> ${phoneNumber}`);
            }
          }
        } else if (this.sessionId && responseSessionId === this.sessionId) {
          // If the session_id matches our global session, try to use the first available phone
          if (this.sessionPhones.size > 0) {
            phoneNumber = Array.from(this.sessionPhones.values())[0];
            console.log(`[${timestamp}] ✅ Usando sessão global com primeiro número disponível: ${phoneNumber}`);
          } else {
            // Use default phone number as fallback
            phoneNumber = DEFAULT_PHONE_NUMBER;
            console.log(`[${timestamp}] ⚠️  Sessão global encontrada mas nenhum número mapeado`);
            console.log(`[${timestamp}] 📱 Usando número padrão: ${phoneNumber}`);
            
            // Create mapping for future use (only if phone number is valid)
            if (responseSessionId) {
              if (this.setSessionMapping(phoneNumber, responseSessionId)) {
                console.log(`[${timestamp}] 🔄 Mapeamento criado: ${responseSessionId} -> ${phoneNumber}`);
              }
            }
          }
        } else {
          // Use default phone number as fallback
          phoneNumber = DEFAULT_PHONE_NUMBER;
          console.log(`[${timestamp}] ⚠️  Não foi possível determinar o número pelo session_id`);
          console.log(`[${timestamp}]    Session ID recebido: ${responseSessionId}`);
          console.log(`[${timestamp}]    Global sessionId: ${this.sessionId || 'N/A'}`);
          console.log(`[${timestamp}]    Sessões disponíveis:`, Array.from(this.sessionPhones.keys()));
          console.log(`[${timestamp}] 📱 Usando número padrão: ${phoneNumber}`);
          
          // Update mapping for future use
          if (responseSessionId) {
            this.sessionPhones.set(responseSessionId, phoneNumber);
            this.phoneSessions.set(phoneNumber, responseSessionId);
            console.log(`[${timestamp}] 🔄 Mapeamento criado: ${responseSessionId} -> ${phoneNumber}`);
          }
        }
        
        if (phoneNumber) {
          // Validate phone number before sending
          if (!this.isValidPhoneNumber(phoneNumber)) {
            const invalidTimestamp = new Date().toISOString();
            console.error(`[${invalidTimestamp}] ❌ Número de telefone inválido: ${phoneNumber}`);
            console.error(`[${invalidTimestamp}]    Limpando mapeamento e ignorando mensagem`);
            this.cleanupInvalidMappings(phoneNumber);
            return;
          }

          // Check if phone number matches DEFAULT_PHONE_NUMBER (only send to configured number)
          const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
          const normalizedDefault = DEFAULT_PHONE_NUMBER.replace(/[+\s-]/g, '');
          
          if (normalizedPhone !== normalizedDefault) {
            const unauthorizedTimestamp = new Date().toISOString();
            console.log(`[${unauthorizedTimestamp}] ⚠️  Tentativa de enviar mensagem para número não autorizado: ${phoneNumber}`);
            console.log(`[${unauthorizedTimestamp}]    Número esperado: ${DEFAULT_PHONE_NUMBER}`);
            console.log(`[${unauthorizedTimestamp}]    Mensagem não será enviada.`);
            return;
          }
          
          // Check bot mode: if reactive, only send messages after user has messaged
          // In proactive mode, also wait for manual start via command
          const botMode = getBotMode();
          const isReactive = isReactiveMode();
          const hasUserMessaged = this.userHasMessaged.get(phoneNumber) || false;
          const allowFirstAfterRestart = this.allowFirstMessageAfterRestart.get(phoneNumber) || false;
          
          // In reactive mode: only send messages after user has messaged
          if (isReactive && !hasUserMessaged && !allowFirstAfterRestart) {
            const skipTimestamp = new Date().toISOString();
            console.log(`\n[${skipTimestamp}] ⏭️  Modo REATIVO: Aguardando mensagem do usuário antes de enviar`);
            console.log(`[${skipTimestamp}]    Phone: ${phoneNumber}`);
            console.log(`[${skipTimestamp}]    Message: "${utterance.substring(0, 50)}${utterance.length > 50 ? '...' : ''}"`);
            console.log(`[${skipTimestamp}]    Bot mode: ${botMode.toUpperCase()}`);
            console.log(`${'='.repeat(80)}\n`);
            return; // Don't send automatic messages in reactive mode
          }
          
          // In proactive mode: only send if user has messaged OR if explicitly allowed (via start-conversation command)
          if (!isReactive && !hasUserMessaged && !allowFirstAfterRestart) {
            const skipTimestamp = new Date().toISOString();
            console.log(`\n[${skipTimestamp}] ⏭️  Modo PROATIVO: Aguardando comando 'npm run start-conversation' para iniciar`);
            console.log(`[${skipTimestamp}]    Phone: ${phoneNumber}`);
            console.log(`[${skipTimestamp}]    Message: "${utterance.substring(0, 50)}${utterance.length > 50 ? '...' : ''}"`);
            console.log(`[${skipTimestamp}]    Bot mode: ${botMode.toUpperCase()}`);
            console.log(`${'='.repeat(80)}\n`);
            return; // Don't send automatic messages until conversation is started manually
          }
          
          // Clear the flag after first message is sent
          if (allowFirstAfterRestart) {
            this.allowFirstMessageAfterRestart.delete(phoneNumber);
            console.log(`[${timestamp}] ✅ Primeira mensagem após início manual enviada (modo ${botMode.toUpperCase()})`);
          }
          
          console.log(`\n[${timestamp}] 📤 ENVIANDO RESPOSTA DO OCP PARA WHATSAPP`);
          console.log(`[${timestamp}]    Bot mode: ${botMode.toUpperCase()}`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Session ID: ${responseSessionId || 'N/A'}`);
          console.log(`[${timestamp}]    Action Type: ${response.action_type || 'N/A'}`);
          console.log(`[${timestamp}]    Sequence ID: ${response.sequence_id || 'N/A'}`);
          console.log(`[${timestamp}]    Message: "${utterance}"`);
          
          // Check if this is an escalation message - if so, activate agent mode
          const isEscalation = this.isEscalationMessage(utterance);
          if (isEscalation) {
            const escalationTimestamp = new Date().toISOString();
            console.log(`\n[${escalationTimestamp}] 🚨 MENSAGEM DE ESCALAÇÃO DETECTADA!`);
            console.log(`[${escalationTimestamp}]    Phone: ${phoneNumber}`);
            console.log(`[${escalationTimestamp}]    Message: "${utterance}"`);
            console.log(`[${escalationTimestamp}]    Ativando modo agente - OCP será desabilitado para este número`);
            setAgentMode(phoneNumber, true);
            console.log(`[${escalationTimestamp}]    ✅ Modo agente ativado. Mensagens futuras não serão enviadas para OCP.`);
            console.log(`[${escalationTimestamp}]    📡 Frontend pode enviar mensagens via POST /agent/message\n`);
          }
          
          // Check if this is "Como posso ajudá-lo hoje?" message
          const isHelpMessage = this.isHelpMessage(utterance);
          
          if (isHelpMessage) {
            // Check if user has sent any messages (first message from OCP should be sent)
            const hasUserMessageHistory = this.lastUserMessageTimestamps.has(phoneNumber);
            
            if (!hasUserMessageHistory) {
              // First message from OCP - send it
              console.log(`[${timestamp}] ✅ Primeira mensagem do OCP, enviando normalmente`);
            } else {
              // User has sent messages before - need to wait for 3rd occurrence
              const count = this.incrementHelpMessageCounter(phoneNumber);
              console.log(`[${timestamp}] 📊 Contador de "Como posso ajudá-lo hoje?": ${count}/3`);
              
              if (count < 3) {
                const skipTimestamp = new Date().toISOString();
                console.log(`[${skipTimestamp}] ⏭️  Pulando mensagem (${count}/3). Aguardando 3ª ocorrência...`);
                console.log(`${'='.repeat(80)}\n`);
                return; // Don't send to WhatsApp
              } else {
                console.log(`[${timestamp}] ✅ 3ª ocorrência alcançada! Enviando mensagem para WhatsApp`);
                this.resetHelpMessageCounter(phoneNumber); // Reset after sending
              }
            }
          } else {
            // Not a help message - reset counter
            this.resetHelpMessageCounter(phoneNumber);
          }
          
          // Enqueue message to WhatsApp (will be processed sequentially by queue)
          try {
            this.sendToWhatsApp(phoneNumber, utterance);
            
            // Record bot message for tracking (to detect when bot says waiting phrase and track images)
            botMessageTracker.recordBotMessage(phoneNumber, utterance);
            const recordTimestamp = new Date().toISOString();
            console.log(`[${recordTimestamp}] 📝 Mensagem do bot registrada para rastreamento: "${utterance.substring(0, 50)}${utterance.length > 50 ? '...' : ''}"`);
            
            const successTimestamp = new Date().toISOString();
            console.log(`[${successTimestamp}] ✅ Mensagem enfileirada para WhatsApp!`);
            
            // Check if OCP response contains catalog keywords - enqueue catalog immediately after the message
            if (shouldSendCatalog(utterance)) {
              const catalogTimestamp = new Date().toISOString();
              console.log(`\n[${catalogTimestamp}] 🎯 PALAVRA-CHAVE DETECTADA NA RESPOSTA DO OCP!`);
              console.log(`[${catalogTimestamp}]    Palavras-chave: ${CATALOG_KEYWORDS.join(', ')}`);
              console.log(`[${catalogTimestamp}]    Mensagem do OCP: "${utterance.substring(0, 100)}${utterance.length > 100 ? '...' : ''}"`);
              console.log(`[${catalogTimestamp}]    Enfileirando catálogo após a resposta...`);
              
              // Enqueue catalog immediately (will be processed sequentially by queue)
              this.sendCatalogToWhatsApp(phoneNumber);
            }
            
            console.log(`${'='.repeat(80)}\n`);
          } catch (error: any) {
            const errorTimestamp = new Date().toISOString();
            console.error(`[${errorTimestamp}] ❌ Erro ao enfileirar mensagem:`, error.message);
            console.log(`${'='.repeat(80)}\n`);
          }
        }
        return;
      }


      // Handle text response (legacy format)
      if (response.type === 'text' || response.utterance || response.text) {
        const utterance = response.utterance || response.text || '';
        if (!utterance.trim()) {
          return; // Skip empty messages
        }

        const clientMessageId = response.client_message_id || response.message_id;
        const responseSessionId = response.session_id || this.sessionId;
        let phoneNumber: string | null = null;

        const timestamp = new Date().toISOString();
        
        // Try to find phone number from client_message_id (response to a WhatsApp message)
        if (clientMessageId && this.messageQueue.has(clientMessageId)) {
          const queueEntry = this.messageQueue.get(clientMessageId)!;
          phoneNumber = queueEntry.phoneNumber;
          this.messageQueue.delete(clientMessageId);

          // Update session mapping (only if phone number is valid)
          if (responseSessionId && phoneNumber) {
            this.setSessionMapping(phoneNumber, responseSessionId);
          }
          
          console.log(`[${timestamp}] 🔄 TIPO: Resposta do OCP (para mensagem do WhatsApp)`);
          console.log(`[${timestamp}]    Client Message ID: ${clientMessageId}`);
          console.log(`[${timestamp}]    Session ID: ${responseSessionId || 'N/A'}`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Message: "${utterance}"`);
        } 
        // If no client_message_id, this is a message initiated by OCP
        // Try to find phone number from session_id
        else if (responseSessionId && this.sessionPhones.has(responseSessionId)) {
          phoneNumber = this.sessionPhones.get(responseSessionId)!;
          console.log(`[${timestamp}] 🚀 TIPO: OCP iniciou a conversa (mensagem não solicitada)`);
          console.log(`[${timestamp}]    Session ID: ${responseSessionId}`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Message: "${utterance}"`);
        }
        // If still no phone number, check if we have a default or single active session
        else if (this.sessionPhones.size === 1) {
          // Only one active session, use it
          phoneNumber = Array.from(this.sessionPhones.values())[0];
          console.log(`[${timestamp}] 🚀 TIPO: OCP iniciou conversa (usando sessão ativa única)`);
          console.log(`[${timestamp}]    Session ID: ${responseSessionId || 'N/A'}`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Message: "${utterance}"`);
        }

        if (phoneNumber) {
          // Validate phone number before sending
          if (!this.isValidPhoneNumber(phoneNumber)) {
            const invalidTimestamp = new Date().toISOString();
            console.error(`[${invalidTimestamp}] ❌ Número de telefone inválido: ${phoneNumber}`);
            console.error(`[${invalidTimestamp}]    Limpando mapeamento e ignorando mensagem`);
            this.cleanupInvalidMappings(phoneNumber);
            return;
          }

          // Check if phone number matches DEFAULT_PHONE_NUMBER (only send to configured number)
          const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
          const normalizedDefault = DEFAULT_PHONE_NUMBER.replace(/[+\s-]/g, '');
          
          if (normalizedPhone !== normalizedDefault) {
            const unauthorizedTimestamp = new Date().toISOString();
            console.log(`[${unauthorizedTimestamp}] ⚠️  Tentativa de enviar mensagem para número não autorizado: ${phoneNumber}`);
            console.log(`[${unauthorizedTimestamp}]    Número esperado: ${DEFAULT_PHONE_NUMBER}`);
            console.log(`[${unauthorizedTimestamp}]    Mensagem não será enviada.`);
            return;
          }
          
          // Send response back to WhatsApp
          console.log(`\n[${timestamp}] 📤 ENVIANDO RESPOSTA DO OCP PARA WHATSAPP`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Message: "${utterance}"`);
          
          // Check if this is "" message
          const isHelpMessage = this.isHelpMessage(utterance);
          
          if (isHelpMessage) {
            // Check if user has sent any messages (first message from OCP should be sent)
            const hasUserMessageHistory = this.lastUserMessageTimestamps.has(phoneNumber);
            
            if (!hasUserMessageHistory) {
              // First message from OCP - send it
              console.log(`[${timestamp}] ✅ Primeira mensagem do OCP, enviando normalmente`);
            } else {
              // User has sent messages before - need to wait for 3rd occurrence
              const count = this.incrementHelpMessageCounter(phoneNumber);
              console.log(`[${timestamp}] 📊 Contador de "Como posso ajudá-lo hoje?": ${count}/3`);
              
              if (count < 3) {
                const skipTimestamp = new Date().toISOString();
                console.log(`[${skipTimestamp}] ⏭️  Pulando mensagem (${count}/3). Aguardando 3ª ocorrência...`);
                console.log(`${'='.repeat(80)}\n`);
                return; // Don't send to WhatsApp
              } else {
                console.log(`[${timestamp}] ✅ 3ª ocorrência alcançada! Enviando mensagem para WhatsApp`);
                this.resetHelpMessageCounter(phoneNumber); // Reset after sending
              }
            }
          } else {
            // Not a help message - reset counter
            this.resetHelpMessageCounter(phoneNumber);
          }
          
          try {
            this.sendToWhatsApp(phoneNumber, utterance);
            console.log(`[${timestamp}] ✅ Mensagem enfileirada para WhatsApp!`);
            
            // Check if OCP response contains catalog keywords - enqueue catalog immediately after the message
            if (shouldSendCatalog(utterance)) {
              const catalogTimestamp = new Date().toISOString();
              console.log(`\n[${catalogTimestamp}] 🎯 PALAVRA-CHAVE DETECTADA NA RESPOSTA DO OCP!`);
              console.log(`[${catalogTimestamp}]    Palavras-chave: ${CATALOG_KEYWORDS.join(', ')}`);
              console.log(`[${catalogTimestamp}]    Mensagem do OCP: "${utterance.substring(0, 100)}${utterance.length > 100 ? '...' : ''}"`);
              console.log(`[${catalogTimestamp}]    Enfileirando catálogo após a resposta...`);
              
              // Enqueue catalog immediately (will be processed sequentially by queue)
              this.sendCatalogToWhatsApp(phoneNumber);
            }
            
            console.log(`${'='.repeat(80)}\n`);
          } catch (error: any) {
            const errorTimestamp = new Date().toISOString();
            console.error(`[${errorTimestamp}] ❌ Erro ao enfileirar mensagem:`, error.message);
            console.log(`${'='.repeat(80)}\n`);
          }
        } else {
          // Message from OCP but we can't determine recipient
          const timestamp = new Date().toISOString();
          console.log(`[${timestamp}] ⚠️  OCP sent message but cannot determine WhatsApp recipient`);
          console.log(`[${timestamp}]    Response:`, JSON.stringify(response, null, 2));
          console.log(`[${timestamp}]    Active sessions:`, Array.from(this.sessionPhones.entries()));
          console.log(`[${timestamp}] 💡 Tip: Make sure to send a message from WhatsApp first to establish the session mapping`);
        }
      }
    } catch (error: any) {
      console.error('❌ Error parsing OCP response:', error.message);
    }
  }

  // Queue management methods
  private enqueueMessage(phoneNumber: string, type: QueueItemType, text?: string): void {
    if (!this.sendQueues.has(phoneNumber)) {
      this.sendQueues.set(phoneNumber, []);
    }
    
    const queue = this.sendQueues.get(phoneNumber)!;
    queue.push({
      type,
      phoneNumber,
      text,
      timestamp: Date.now()
    });
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📋 Mensagem enfileirada (${type}): ${queue.length} na fila para ${phoneNumber}`);
    
    // Start processing if not already processing
    this.processQueue(phoneNumber);
  }
  
  private async processQueue(phoneNumber: string): Promise<void> {
    // If already processing this queue, don't start another process
    if (this.processingQueues.get(phoneNumber)) {
      return;
    }
    
    const queue = this.sendQueues.get(phoneNumber);
    if (!queue || queue.length === 0) {
      return;
    }
    
    // Mark as processing
    this.processingQueues.set(phoneNumber, true);
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Processando fila para ${phoneNumber} (${queue.length} item(s))`);
    
    // Process items sequentially
    while (queue.length > 0) {
      const item = queue.shift()!;
      
      try {
        if (item.type === 'text' && item.text) {
          await this.sendToWhatsAppDirect(item.phoneNumber, item.text);
        } else if (item.type === 'catalog') {
          await this.sendCatalogToWhatsAppDirect(item.phoneNumber);
        }
        
        const successTimestamp = new Date().toISOString();
        console.log(`[${successTimestamp}] ✅ Item processado (${item.type}), restam ${queue.length} na fila`);
      } catch (error: any) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] ❌ Erro ao processar item da fila (${item.type}):`, error.message);
        // Continue processing next item even if one fails
      }
    }
    
    // Mark as not processing
    this.processingQueues.set(phoneNumber, false);
    
    const finishTimestamp = new Date().toISOString();
    console.log(`[${finishTimestamp}] ✅ Fila processada para ${phoneNumber}`);
  }
  
  // Public methods that enqueue messages
  private async sendCatalogToWhatsApp(phoneNumber: string): Promise<void> {
    this.enqueueMessage(phoneNumber, 'catalog');
  }
  
  private async sendToWhatsApp(phoneNumber: string, text: string): Promise<void> {
    this.enqueueMessage(phoneNumber, 'text', text);
  }
  
  // Direct send methods (used by queue processor)
  private async sendCatalogToWhatsAppDirect(phoneNumber: string): Promise<void> {
    const timestamp = new Date().toISOString();
    try {
      // Path to catalog image
      const imagePath = path.join(process.cwd(), 'imgs', 'catalog.png');
      
      // Check if image exists
      if (!fs.existsSync(imagePath)) {
        console.error(`[${timestamp}] ❌ Imagem não encontrada: ${imagePath}`);
        return;
      }
      
      // Read image file and convert to base64
      console.log(`[${timestamp}] 📖 Lendo imagem do catálogo: ${imagePath}`);
      const imageBuffer = fs.readFileSync(imagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
      // Format phone number (add country code if needed)
      let formattedNumber = phoneNumber;
      if (formattedNumber.length === 11 && !formattedNumber.startsWith('1') && !formattedNumber.startsWith('55')) {
        formattedNumber = `1${formattedNumber}`;
      } else if (formattedNumber.length === 10) {
        formattedNumber = `1${formattedNumber}`;
      }
      
      console.log(`[${timestamp}] 📤 Enviando catálogo para WhatsApp`);
      console.log(`[${timestamp}]    Phone: ${formattedNumber}`);
      console.log(`[${timestamp}]    Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      
      // Send image via Evolution API service (includes instance verification)
      const messageId = await evolutionApiService.sendMedia(
        formattedNumber,
        'image',
        imageBase64,
        'catalog.png',
        ''
      );
      
      if (messageId) {
        console.log(`[${timestamp}] ✅ Catálogo enviado com sucesso!`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        
        // Log BOT message with catalog image
        const logger = getMessageLogger();
        await logger.logBotMessage({
          phoneNumber: phoneNumber,
          text: '', // Catalog has no text, only image
          imagePath: imagePath,
          messageId: messageId
        });
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar catálogo:`, error.message);
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const errorData = error.response.data;
          const errorMessage = errorData?.response?.message || errorData?.message || `HTTP ${error.response.status}`;
          console.error(`[${errorTimestamp}]    Response:`, JSON.stringify(errorData, null, 2));
        }
      }
    }
  }

  private async sendToWhatsAppDirect(phoneNumber: string, text: string): Promise<void> {
    try {
      // Format phone number - ensure it has country code
      let formattedNumber = phoneNumber;
      
      // If number is 11 digits and doesn't start with country code, add it
      // Canada/US: starts with 1, Brazil: starts with 55
      if (formattedNumber.length === 11) {
        if (!formattedNumber.startsWith('1') && !formattedNumber.startsWith('55')) {
          // Assume US/Canada if 11 digits without country code
          formattedNumber = `1${formattedNumber}`;
          const formatTimestamp = new Date().toISOString();
          console.log(`[${formatTimestamp}] 🔄 Formatando número: ${phoneNumber} -> ${formattedNumber}`);
        }
      } else if (formattedNumber.length === 10) {
        // If 10 digits, assume it's missing country code (US/Canada)
        formattedNumber = `1${formattedNumber}`;
        const formatTimestamp = new Date().toISOString();
        console.log(`[${formatTimestamp}] 🔄 Adicionando código do país: ${phoneNumber} -> ${formattedNumber}`);
      }
      // Brazilian numbers (13 digits starting with 55) are already formatted correctly
      
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📤 Tentando enviar para Evolution API...`);
      console.log(`[${timestamp}]    Number: ${formattedNumber}`);
      console.log(`[${timestamp}]    Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      
      try {
        // Use evolutionApiService which includes instance verification
        const messageId = await evolutionApiService.sendTextMessage(formattedNumber, text);
        
        if (messageId) {
          const successTimestamp = new Date().toISOString();
          console.log(`[${successTimestamp}] ✅ OCP → WhatsApp: Message sent successfully`);
          console.log(`[${successTimestamp}]    Phone: ${formattedNumber}`);
          console.log(`[${successTimestamp}]    Message ID: ${messageId}`);
          
          // Log BOT message
          const logger = getMessageLogger();
          await logger.logBotMessage({
            phoneNumber: phoneNumber,
            text: text,
            messageId: messageId
          });
        }
      } catch (error: any) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] ❌ Erro ao enviar para WhatsApp:`, error.message);
        
        // If it's a 400 error, likely invalid phone number - clean up session mapping
        if (axios.isAxiosError(error) && error.response?.status === 400) {
          this.cleanupInvalidMappings(formattedNumber);
        }
        
        // If it's a 404 error (instance not found), log helpful message
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.error(`[${errorTimestamp}] 💡 Dica: Verifique se a instância existe e está conectada usando: GET /api/instances`);
        }
        
        // Re-throw to let caller handle it
        throw error;
      }
      
      // Don't throw - just log the error so other messages can still be processed
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro inesperado ao enviar para WhatsApp:`, error.message);
      // Don't throw - just log
    }
  }

  private generateClientMessageId(): string {
    return crypto.randomUUID();
  }

  private isValidPhoneNumber(phoneNumber: string): boolean {
    // Phone number should be numeric and between 10-15 digits
    return /^\d{10,15}$/.test(phoneNumber);
  }


  private cleanupInvalidMappings(phoneNumber: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🧹 Limpando mapeamentos inválidos para: ${phoneNumber}`);
    
    const sessionsToRemove: string[] = [];
    this.phoneSessions.forEach((sessionId, phone) => {
      if (phone === phoneNumber || !this.isValidPhoneNumber(phone)) {
        sessionsToRemove.push(sessionId);
        this.phoneSessions.delete(phone);
        console.log(`[${timestamp}]    Removido: ${phone} -> ${sessionId}`);
      }
    });
    
    sessionsToRemove.forEach(sessionId => {
      this.sessionPhones.delete(sessionId);
    });
    
    if (sessionsToRemove.length > 0) {
      console.log(`[${timestamp}] ✅ Limpeza concluída: ${sessionsToRemove.length} mapeamento(s) removido(s)`);
    }
  }

  private setSessionMapping(phoneNumber: string, sessionId: string): boolean {
    if (!this.isValidPhoneNumber(phoneNumber)) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] ⚠️  Tentativa de mapear número inválido: ${phoneNumber} -> ${sessionId}`);
      console.warn(`[${timestamp}]    Mapeamento não criado`);
      return false;
    }
    
    this.phoneSessions.set(phoneNumber, sessionId);
    this.sessionPhones.set(sessionId, phoneNumber);
    return true;
  }

  public async handleIncomingWhatsAppMessage(message: any): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // Extract phone number from remoteJid (format: 5511999999999@s.whatsapp.net)
    const remoteJid = message.key?.remoteJid || '';
    if (!remoteJid) {
      console.log(`[${timestamp}] ⚠️  Mensagem sem remoteJid, ignorando...`);
      return;
    }

    // Skip group messages
    if (remoteJid.includes('@g.us')) {
      console.log(`[${timestamp}] ⏭️  Ignorando mensagem de grupo: ${remoteJid}`);
      return;
    }

    const phoneNumber = remoteJid.split('@')[0];
    
    // Validate phone number (should be numeric and reasonable length)
    if (!/^\d{10,15}$/.test(phoneNumber)) {
      console.log(`[${timestamp}] ⚠️  Número de telefone inválido: ${phoneNumber}, ignorando...`);
      return;
    }

    // Check if phone number matches DEFAULT_PHONE_NUMBER (only accept messages from configured number)
    // Normalize both numbers for comparison (remove any formatting)
    const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
    const normalizedDefault = DEFAULT_PHONE_NUMBER.replace(/[+\s-]/g, '');
    
    if (normalizedPhone !== normalizedDefault) {
      console.log(`[${timestamp}] ⚠️  Número não autorizado: ${phoneNumber}`);
      console.log(`[${timestamp}]    Número esperado: ${DEFAULT_PHONE_NUMBER}`);
      console.log(`[${timestamp}]    Mensagem ignorada.`);
      return;
    }
    
    // Extract text from various message formats
    const text = message.message?.conversation || 
                 message.message?.extendedTextMessage?.text ||
                 message.message?.text ||
                 '';

    if (!text.trim()) {
      console.log(`[${timestamp}] ⚠️  Mensagem sem texto, ignorando...`);
      return; // Skip empty messages
    }

    console.log(`\n[${timestamp}] 📥 WHATSAPP → OCP: Recebendo mensagem`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    console.log(`[${timestamp}]    Message: "${text}"`);

    // Mark that user has messaged (for reactive mode)
    this.userHasMessaged.set(phoneNumber, true);
    const botMode = getBotMode();
    if (isReactiveMode()) {
      console.log(`[${timestamp}] ✅ Usuário enviou mensagem - modo REATIVO agora permite respostas do OCP`);
    }

    // Check if OCP WebSocket is connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`[${timestamp}] ❌ OCP WebSocket não está conectado!`);
      console.error(`[${timestamp}]    Tentando reconectar...`);
      this.connect();
      // Wait a bit for connection
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error(`[${timestamp}] ❌ Ainda não conectado. Mensagem não será enviada.`);
        return;
      }
    }

    // Reset help message counter when user sends a message
    this.resetHelpMessageCounter(phoneNumber);
    // Update last user message timestamp
    this.lastUserMessageTimestamps.set(phoneNumber, Date.now());
    
    // Send to OCP
    console.log(`[${timestamp}] 📤 Enviando mensagem para OCP...`);
    this.sendMessageToOCP(phoneNumber, text);
  }

  public isOCPConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public allowFirstMessageForPhone(phoneNumber: string): void {
    this.allowFirstMessageAfterRestart.set(phoneNumber, true);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ Primeira mensagem permitida para ${phoneNumber} (início manual da conversa)`);
  }

  // Check if message is "Como posso ajudá-lo hoje?"
  private isHelpMessage(utterance: string): boolean {
    const lowerText = utterance.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
    const helpMessages = [
      'como posso ajudá-lo hoje',
      'como posso ajudá-lo',
      'como posso ajudar hoje',
      'como posso ajudar',
      'como posso te ajudar hoje',
      'como posso te ajudar'
    ];
    return helpMessages.some(msg => lowerText.includes(msg));
  }

  // Check if message indicates escalation to agent
  private isEscalationMessage(utterance: string): boolean {
    const lowerText = utterance.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents
    const escalationPhrases = [
      'vamos te escalar para um de nossos agentes',
      'vamos te escalar para um de nossos agentes',
      'escalar para um de nossos agentes',
      'escalar para agente',
      'transferir para agente',
      'vamos transferir para um agente',
      'conectar com um agente',
      'vamos conectar com um agente',
      'escalar para um agente',
      'transferir para um agente humano'
    ];
    return escalationPhrases.some(phrase => lowerText.includes(phrase));
  }

  // Increment help message counter for a phone number
  private incrementHelpMessageCounter(phoneNumber: string): number {
    const currentCount = this.helpMessageCounters.get(phoneNumber) || 0;
    const newCount = currentCount + 1;
    this.helpMessageCounters.set(phoneNumber, newCount);
    return newCount;
  }

  // Reset help message counter for a phone number
  private resetHelpMessageCounter(phoneNumber: string): void {
    this.helpMessageCounters.delete(phoneNumber);
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Contador de "Como posso ajudá-lo hoje?" zerado para ${phoneNumber}`);
  }

  /**
   * Start periodic ping to keep WebSocket connection alive
   */
  private startPingInterval(): void {
    // Stop any existing ping interval
    this.stopPingInterval();
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🏓 Iniciando ping periódico (a cada ${this.PING_INTERVAL_MS / 1000}s) para manter conexão viva`);
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          // Use WebSocket ping() method (Node.js 'ws' library supports this)
          // The 'ws' library's ping() method sends a ping frame and returns void
          if (typeof (this.ws as any).ping === 'function') {
            (this.ws as any).ping();
            // Log ping only occasionally (every 5th ping = every 2.5 minutes) to avoid log spam
            this.pingCount++;
            if (this.pingCount % 5 === 0) {
              const pingTimestamp = new Date().toISOString();
              console.log(`[${pingTimestamp}] 🏓 Ping enviado (keepalive) - conexão mantida viva`);
            }
          } else {
            // Fallback: if ping is not available, log a warning
            const pingTimestamp = new Date().toISOString();
            console.warn(`[${pingTimestamp}] ⚠️  Método ping() não disponível no WebSocket`);
          }
        } catch (error: any) {
          const errorTimestamp = new Date().toISOString();
          console.error(`[${errorTimestamp}] ❌ Erro ao enviar ping: ${error.message}`);
          // If ping fails, connection might be dead - stop ping and let reconnect handle it
          this.stopPingInterval();
        }
      } else {
        // Connection is not open, stop ping interval
        const closeTimestamp = new Date().toISOString();
        console.log(`[${closeTimestamp}] ⚠️  Conexão não está aberta, parando ping`);
        this.stopPingInterval();
      }
    }, this.PING_INTERVAL_MS);
  }

  /**
   * Stop periodic ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      this.pingCount = 0; // Reset counter
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 🛑 Ping periódico parado`);
    }
  }

  public disconnect(): void {
    // Stop ping interval
    this.stopPingInterval();
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Restart OCP session (useful when changing bot mode or handling errors)
   */
  public restartSession(): void {
    // Prevent multiple simultaneous restarts
    if (this.isRestarting) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ⏭️  Reinicialização já em andamento, ignorando...`);
      return;
    }

    this.isRestarting = true;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Reiniciando sessão OCP...`);
    
    // Save phone numbers that were mapped before restart (to allow first message after restart)
    const phoneNumbersToAllowFirst = new Set<string>();
    this.phoneSessions.forEach((_, phoneNumber) => {
      phoneNumbersToAllowFirst.add(phoneNumber);
    });
    // Also add default phone number
    phoneNumbersToAllowFirst.add(DEFAULT_PHONE_NUMBER);
    
    // Clear session state
    const oldSessionId = this.sessionId;
    this.sessionId = null;
    this.sessionInvalidated = true;
    this.phoneSessions.clear();
    this.sessionPhones.clear();
    this.userHasMessaged.clear();
    
    // Mark phone numbers to allow first message after restart (even in reactive mode)
    phoneNumbersToAllowFirst.forEach(phoneNumber => {
      this.allowFirstMessageAfterRestart.set(phoneNumber, true);
    });
    
    console.log(`[${timestamp}]    Session ID anterior: ${oldSessionId || 'N/A'}`);
    console.log(`[${timestamp}]    Limpando mapeamentos e estado...`);
    console.log(`[${timestamp}]    Permitindo primeira mensagem após reinicialização para ${phoneNumbersToAllowFirst.size} número(s)`);
    
    // Disconnect and reconnect
    this.disconnect();
    
    setTimeout(() => {
      this.connect();
      this.isRestarting = false;
      const reconnectTimestamp = new Date().toISOString();
      console.log(`[${reconnectTimestamp}] ✅ Sessão OCP reiniciada`);
    }, 1000);
  }
}

// Export singleton instance
let ocpClient: OCPWebSocketClient | null = null;

export function getOCPClient(): OCPWebSocketClient {
  if (!ocpClient) {
    ocpClient = new OCPWebSocketClient();
  }
  return ocpClient;
}

export { OCPWebSocketClient };

