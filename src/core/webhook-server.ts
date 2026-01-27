import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import OpenAI from 'openai';
import { getOCPClient } from './ocp-websocket';
import { getMessageLogger } from './message-logger';
import { botMessageTracker } from '../utils/bot-message-tracker';
import { isInAgentMode, setAgentMode } from '../features/agent-mode';

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.WEBHOOK_PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

// Evolution API configuration
const EVOLUTION_API_URL = process.env.SERVER_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.AUTHENTICATION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';
const DEFAULT_PHONE_NUMBER = process.env.DEFAULT_PHONE_NUMBER || '13688852974';

// OpenAI configuration for audio transcription
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// CORS configuration - allow requests from frontend
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // Allow localhost
    const allowedOrigins = [
      /^http:\/\/localhost(:\d+)?$/,
      /^https:\/\/localhost(:\d+)?$/,
    ];
    
    // Check if origin matches any allowed pattern
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // For development, allow all origins (uncomment for production to restrict)
      callback(null, true);
      // Or reject unknown origins (uncomment for strict mode)
      // callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Increase body parser limit to handle large WhatsApp message payloads (media, encryption metadata, etc.)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Function to detect if user message indicates need for escalation
// Only escalates if message matches the exact escalation phrase
function shouldEscalateToAgent(userMessage: string): boolean {
  // Exact phrase that triggers escalation
  const escalationPhrase = 'Olá, eu acabei de pagar meu boleto via Pix para liberar meu limite, mas o sistema ainda não atualizou e eu não consigo fechar meu pedido da Beauty Week. Podem verificar?';
  
  // Normalize both messages for comparison (remove accents, lowercase, trim whitespace)
  const normalize = (text: string): string => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };
  
  const normalizedUserMessage = normalize(userMessage);
  const normalizedEscalationPhrase = normalize(escalationPhrase);
  
  // Check if messages match exactly (after normalization)
  return normalizedUserMessage === normalizedEscalationPhrase;
}

// Webhook endpoint for Evolution API
app.post('/webhook', async (req, res) => {
  try {
    const event = req.body;
    const timestamp = new Date().toISOString();

    // Handle different event types
    // Evolution API sends: { event: "MESSAGES_UPSERT", instance: "...", data: {...} }
    if (event.event === 'MESSAGES_UPSERT' || event.event === 'MESSAGES_SET' || event.event === 'messages.upsert') {
      // Data can be a single message object or array
      const messageData = Array.isArray(event.data) ? event.data : [event.data];
      
      // Filter out group messages before processing
      const nonGroupMessages = messageData.filter((msg: any) => {
        const remoteJid = msg.key?.remoteJid || '';
        return !remoteJid.includes('@g.us');
      });
      
      // Only log webhook if there are non-group messages to process (keep terminal clean)
      if (nonGroupMessages.length > 0) {
        console.log(`\n[${timestamp}] 📥 Webhook received from Evolution API`);
        console.log(`[${timestamp}]    Event: ${event.event || 'unknown'}`);
        console.log(`[${timestamp}]    Instance: ${event.instance || 'unknown'}`);
        console.log(`[${timestamp}] 📦 Processing ${nonGroupMessages.length} message(s)`);
      }
      
      for (const message of nonGroupMessages) {
        const remoteJid = message.key?.remoteJid || '';
        
        // Skip messages sent by us (no logging to keep terminal clean)
        if (message.key?.fromMe) {
          continue; // Skip messages we sent silently
        }
        
        // Only process text messages that are not from us
        if (message.key?.fromMe) {
          continue; // Skip messages we sent silently
        }

        const phoneNumber = remoteJid.split('@')[0] || 'unknown';
        
        // Validate phone number (should be numeric and reasonable length)
        if (!/^\d{10,15}$/.test(phoneNumber)) {
          console.log(`[${timestamp}] ⏭️  Skipping message with invalid phone number: ${phoneNumber}`);
          continue;
        }

        // Check if phone number matches DEFAULT_PHONE_NUMBER (only accept messages from configured number)
        // Normalize both numbers for comparison (remove any formatting)
        const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
        const normalizedDefault = DEFAULT_PHONE_NUMBER.replace(/[+\s-]/g, '');
        
        if (normalizedPhone !== normalizedDefault) {
          console.log(`[${timestamp}] ⚠️  Número não autorizado no webhook: ${phoneNumber}`);
          console.log(`[${timestamp}]    Número esperado: ${DEFAULT_PHONE_NUMBER}`);
          console.log(`[${timestamp}]    Normalizado recebido: ${normalizedPhone}`);
          console.log(`[${timestamp}]    Normalizado esperado: ${normalizedDefault}`);
          console.log(`[${timestamp}]    Mensagem ignorada.`);
          continue;
        }

        console.log(`[${timestamp}] ✅ Número autorizado: ${phoneNumber} (normalizado: ${normalizedPhone})`);

        // Check for audio message
        const audioMessage = message.message?.audioMessage;
        if (audioMessage) {
          console.log(`\n[${timestamp}] 🎤 MENSAGEM DE ÁUDIO DETECTADA`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Audio ID: ${audioMessage.id || 'N/A'}`);
          
          try {
            const transcription = await transcribeAudio(message, phoneNumber);
            if (transcription) {
              console.log(`[${timestamp}] ✅ Transcrição: "${transcription}"`);
              
              // Send transcription to OCP as if it were a text message
              const ocpClient = getOCPClient();
              const ws = (ocpClient as any).ws;
              const isConnected = ws && ws.readyState === WebSocket.OPEN;
              
              if (!isConnected) {
                console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
              } else {
                console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando transcrição...`);
                // Create a message-like object with the transcription
                const transcriptionMessage = {
                  ...message,
                  message: {
                    conversation: transcription
                  }
                };
                
                // Log USER message with audio
                const logger = getMessageLogger();
                await logger.logMessage({
                  flag: 'USER',
                  phoneNumber: phoneNumber,
                  text: transcription,
                  message: message, // Include original message to extract audio
                  messageId: message.key?.id
                });
                
                await ocpClient.handleIncomingWhatsAppMessage(transcriptionMessage);
                console.log(`[${timestamp}] ✅ Transcrição enviada para OCP`);
              }
            } else {
              console.error(`[${timestamp}] ❌ Falha ao transcrever áudio`);
            }
          } catch (error: any) {
            console.error(`[${timestamp}] ❌ Erro ao processar áudio:`, error.message);
          }
          continue; // Skip to next message
        }

        // Check for media messages with caption (image, video, document, etc.)
        const imageMessage = message.message?.imageMessage;
        const videoMessage = message.message?.videoMessage;
        const documentMessage = message.message?.documentMessage;
        
        // Extract caption from any media message
        let mediaCaption = '';
        let mediaType = '';
        
        if (imageMessage) {
          mediaCaption = imageMessage.caption || '';
          mediaType = 'imagem';
        } else if (videoMessage) {
          mediaCaption = videoMessage.caption || '';
          mediaType = 'vídeo';
        } else if (documentMessage) {
          mediaCaption = documentMessage.caption || '';
          mediaType = 'documento';
        }
        
        if (mediaCaption && mediaCaption.trim()) {
          console.log(`\n[${timestamp}] 📎 MENSAGEM DE MÍDIA COM TEXTO DETECTADA`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Tipo: ${mediaType}`);
          console.log(`[${timestamp}]    Caption: "${mediaCaption}"`);
          
          // Send caption text to OCP as if it were a text message
          const ocpClient = getOCPClient();
          const ws = (ocpClient as any).ws;
          const isConnected = ws && ws.readyState === WebSocket.OPEN;
          
          if (!isConnected) {
            console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
            console.error(`[${timestamp}]    Verifique a conexão com o OCP`);
            console.error(`[${timestamp}]    WebSocket state: ${ws ? ws.readyState : 'NO_WEBSOCKET'}`);
          } else {
            console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando texto da mídia...`);
            // Create a message-like object with the caption text
            const mediaTextMessage = {
              ...message,
              message: {
                conversation: mediaCaption
              }
            };
            
            // Log USER message with media
            const logger = getMessageLogger();
            await logger.logMessage({
              flag: 'USER',
              phoneNumber: phoneNumber,
              text: mediaCaption,
              message: message, // Include original message to extract media
              messageId: message.key?.id
            });
            
            await ocpClient.handleIncomingWhatsAppMessage(mediaTextMessage);
            console.log(`[${timestamp}] ✅ Texto da mídia enviado para OCP`);
          }
          continue; // Skip to next message (media with caption already processed)
        } else if (imageMessage || videoMessage || documentMessage) {
          console.log(`[${timestamp}] 📎 Mensagem de mídia (${mediaType || 'desconhecido'}) sem caption`);
          
          // Count images in this message
          // Each media message counts as 1 image (user can send multiple messages or multiple images in one)
          const imageCount = 1; // Each message with media = 1 image
          
          console.log(`[${timestamp}] 📸 Imagem detectada (${imageCount} imagem nesta mensagem)`);
          
          // Record images and check if we should send "yes" to OCP
          const shouldSendYes = botMessageTracker.recordImage(phoneNumber, imageCount);
            
            // Log USER message with media
            const logger = getMessageLogger();
            await logger.logMessage({
              flag: 'USER',
              phoneNumber: phoneNumber,
            text: '', // No caption
              message: message, // Include original message to extract media
              messageId: message.key?.id
            });
            
          // If we received 3+ images, send "yes" to OCP
          if (shouldSendYes) {
            console.log(`[${timestamp}] 🎯 3+ imagens recebidas! Enviando "yes" para OCP`);
            
            // Send "yes" to OCP as if it were a text message
            const ocpClient = getOCPClient();
            const ws = (ocpClient as any).ws;
            const isConnected = ws && ws.readyState === WebSocket.OPEN;
            
            if (!isConnected) {
              console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
              console.error(`[${timestamp}]    Verifique a conexão com o OCP`);
            } else {
              console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando "yes"...`);
              // Create a message-like object with "yes" as text
              const yesMessage = {
                ...message,
                message: {
                  conversation: 'yes'
                }
              };
              await ocpClient.handleIncomingWhatsAppMessage(yesMessage);
              console.log(`[${timestamp}] ✅ "yes" enviado para OCP`);
            }
          }
          
          continue; // Skip to next message (media without caption already processed)
        }

        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text ||
                     message.message?.text ||
                     '';

        if (text && text.trim()) {
          console.log(`\n[${timestamp}] 📱 PROCESSANDO MENSAGEM DO WHATSAPP`);
          console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
          console.log(`[${timestamp}]    Message: "${text}"`);
          console.log(`[${timestamp}]    Full message:`, JSON.stringify(message, null, 2));
          
          // Log USER message first (before any processing)
          const logger = getMessageLogger();
          await logger.logMessage({
            flag: 'USER',
            phoneNumber: phoneNumber,
            text: text,
            message: message, // Include message to extract any media
            messageId: message.key?.id
          });
          
          // Check if user message indicates need for escalation
          const needsEscalation = shouldEscalateToAgent(text);
          if (needsEscalation && !isInAgentMode(phoneNumber)) {
            const escalationTimestamp = new Date().toISOString();
            console.log(`\n[${escalationTimestamp}] 🚨 NECESSIDADE DE ESCALAÇÃO DETECTADA NA MENSAGEM DO USUÁRIO!`);
            console.log(`[${escalationTimestamp}]    Phone: ${phoneNumber}`);
            console.log(`[${escalationTimestamp}]    Message: "${text}"`);
            console.log(`[${escalationTimestamp}]    Ativando modo agente automaticamente`);
            
            // Activate agent mode
            setAgentMode(phoneNumber, true);
            
            // Send escalation message to WhatsApp
            try {
              const formattedNumber = phoneNumber.replace(/[+\s]/g, '');
              const escalationMessage = 'Entendi. Como sua dúvida é sobre a baixa de valores e liberação de crédito para compras, vamos te escalar para um de nossos agentes para te ajudar.';
              
              const response = await axios.post(
                `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
                {
                  number: formattedNumber,
                  text: escalationMessage
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
                const messageId = response.data?.key?.id || 'N/A';
                console.log(`[${escalationTimestamp}] ✅ Mensagem de escalação enviada para WhatsApp`);
                console.log(`[${escalationTimestamp}]    Message ID: ${messageId}`);
                
                // Log BOT message (escalation message)
                await logger.logBotMessage({
                  phoneNumber: phoneNumber,
                  text: escalationMessage,
                  messageId: messageId !== 'N/A' ? messageId : undefined
                });
              }
            } catch (error: any) {
              console.error(`[${escalationTimestamp}] ❌ Erro ao enviar mensagem de escalação: ${error.message}`);
            }
            
            console.log(`[${escalationTimestamp}]    ✅ Modo agente ativado. Mensagens futuras não serão enviadas para OCP.`);
            console.log(`[${escalationTimestamp}]    📡 Frontend pode enviar mensagens via POST /agent/message\n`);
          }
          
          // Check if phone number is in agent mode
          if (isInAgentMode(phoneNumber)) {
            console.log(`[${timestamp}] 🚨 Modo agente ativo para ${phoneNumber} - mensagem não será enviada para OCP`);
            console.log(`[${timestamp}]    A mensagem será apenas logada. O agente pode responder via POST /agent/message`);
            // Message already logged above
          } else {
            const ocpClient = getOCPClient();
            
            // Check if OCP is connected (check WebSocket state directly)
            const ws = (ocpClient as any).ws;
            const isConnected = ws && ws.readyState === WebSocket.OPEN;
            
            if (!isConnected) {
              console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
              console.error(`[${timestamp}]    Verifique a conexão com o OCP`);
              console.error(`[${timestamp}]    WebSocket state: ${ws ? ws.readyState : 'NO_WEBSOCKET'}`);
            } else {
              console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando mensagem...`);
              // Message already logged above
              
              await ocpClient.handleIncomingWhatsAppMessage(message);
              console.log(`[${timestamp}] ✅ Mensagem enviada para OCP`);
            }
          }
        } else {
          console.log(`[${timestamp}] ⚠️  Mensagem sem texto ou vazia, ignorando...`);
        }
      }
    } else {
      console.log(`[${timestamp}] ℹ️  Event type não processado: ${event.event}`);
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Function to transcribe audio message
async function transcribeAudio(message: any, phoneNumber: string): Promise<string | null> {
  const timestamp = new Date().toISOString();
  
  if (!openai) {
    console.error(`[${timestamp}] ❌ OpenAI API Key não configurada. Configure OPENAI_API_KEY no .env`);
    return null;
  }

  try {
    const audioMessage = message.message?.audioMessage;
    if (!audioMessage) {
      console.error(`[${timestamp}] ❌ Mensagem não contém áudio`);
      return null;
    }

    let audioBuffer: Buffer | null = null;
    
    // Try to get audio from different sources
    // 1. Check if base64 is directly available
    if (message.message?.base64) {
      console.log(`[${timestamp}] 📥 Usando áudio base64 da mensagem`);
      audioBuffer = Buffer.from(message.message.base64, 'base64');
    }
    // 2. Check if audioMessage has url property (direct WhatsApp URL - encrypted)
    // Note: This URL is encrypted and needs decryption via Evolution API
    else if (audioMessage.url || audioMessage.mediaKey) {
      console.log(`[${timestamp}] 📥 Tentando obter áudio descriptografado via Evolution API...`);
      
      const messageId = message.key?.id;
      const remoteJid = message.key?.remoteJid;
      
      if (messageId && remoteJid) {
        try {
          // Use getBase64FromMediaMessage endpoint to get decrypted audio
          const mediaResponse = await axios.post(
            `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`,
            {
              message: {
                key: message.key,
                message: {
                  audioMessage: audioMessage
                }
              }
            },
            {
              headers: {
                apikey: EVOLUTION_API_KEY,
                'Content-Type': 'application/json'
              },
              timeout: 60000
            }
          );
          
          // Response should contain base64 string
          if (mediaResponse.data?.base64) {
            audioBuffer = Buffer.from(mediaResponse.data.base64, 'base64');
            console.log(`[${timestamp}] ✅ Áudio descriptografado via Evolution API (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
          } else if (mediaResponse.data?.media) {
            // Sometimes the response has 'media' instead of 'base64'
            audioBuffer = Buffer.from(mediaResponse.data.media, 'base64');
            console.log(`[${timestamp}] ✅ Áudio descriptografado via Evolution API (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
          } else {
            throw new Error('Response does not contain base64 or media field');
          }
        } catch (apiError: any) {
          console.error(`[${timestamp}] ⚠️  Erro ao obter áudio descriptografado:`, apiError.message);
          if (apiError.response) {
            console.error(`[${timestamp}]    Status: ${apiError.response.status}`);
            if (apiError.response.data) {
              try {
                const errorData = typeof apiError.response.data === 'string' 
                  ? JSON.parse(apiError.response.data)
                  : apiError.response.data;
                console.error(`[${timestamp}]    Data:`, JSON.stringify(errorData, null, 2));
              } catch {
                console.error(`[${timestamp}]    Raw data:`, apiError.response.data.toString().substring(0, 200));
              }
            }
          }
        }
      }
    }
    // 3. Check if mediaUrl is available (alternative property)
    else if (audioMessage.mediaUrl) {
      console.log(`[${timestamp}] 📥 Baixando áudio de mediaUrl: ${audioMessage.mediaUrl}`);
      try {
        const audioResponse = await axios.get(audioMessage.mediaUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        audioBuffer = Buffer.from(audioResponse.data);
        console.log(`[${timestamp}] ✅ Áudio baixado de mediaUrl`);
      } catch (urlError: any) {
        console.error(`[${timestamp}] ⚠️  Erro ao baixar de mediaUrl:`, urlError.message);
      }
    }
    
    // 4. If still no buffer, try to download from Evolution API (fallback)
    if (!audioBuffer) {
      const messageId = message.key?.id;
      const remoteJid = message.key?.remoteJid;
      
      if (messageId && remoteJid) {
        console.log(`[${timestamp}] 📥 Tentando baixar áudio da Evolution API (fallback)...`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        console.log(`[${timestamp}]    Remote JID: ${remoteJid}`);
        
        try {
          // Try different Evolution API endpoints
          // First try: GET endpoint with messageId
          try {
            const mediaResponse = await axios.get(
              `${EVOLUTION_API_URL}/chat/fetchMediaUrl/${INSTANCE_NAME}`,
              {
                params: {
                  messageId: messageId,
                  remoteJid: remoteJid
                },
                headers: {
                  apikey: EVOLUTION_API_KEY
                },
                timeout: 30000
              }
            );
            
            if (mediaResponse.data?.url) {
              const audioResponse = await axios.get(mediaResponse.data.url, {
                responseType: 'arraybuffer',
                timeout: 30000
              });
              audioBuffer = Buffer.from(audioResponse.data);
              console.log(`[${timestamp}] ✅ Áudio baixado via fetchMediaUrl`);
            }
          } catch (getError: any) {
            // If GET fails, try POST (though it returned 404 before)
            console.log(`[${timestamp}] ⚠️  GET fetchMediaUrl falhou, tentando POST...`);
            const mediaResponse = await axios.post(
              `${EVOLUTION_API_URL}/chat/fetchMedia/${INSTANCE_NAME}`,
              {
                message: {
                  key: message.key,
                  message: {
                    audioMessage: audioMessage
                  }
                }
              },
              {
                headers: {
                  apikey: EVOLUTION_API_KEY,
                  'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer',
                timeout: 60000
              }
            );
            
            audioBuffer = Buffer.from(mediaResponse.data);
            console.log(`[${timestamp}] ✅ Áudio baixado via fetchMedia POST`);
          }
        } catch (apiError: any) {
          console.error(`[${timestamp}] ❌ Erro ao baixar da Evolution API:`, apiError.message);
          if (apiError.response) {
            console.error(`[${timestamp}]    Status: ${apiError.response.status}`);
            if (apiError.response.data && typeof apiError.response.data === 'object') {
              try {
                const errorData = Buffer.isBuffer(apiError.response.data) 
                  ? JSON.parse(apiError.response.data.toString())
                  : apiError.response.data;
                console.error(`[${timestamp}]    Data:`, JSON.stringify(errorData, null, 2));
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    }

    if (!audioBuffer) {
      console.error(`[${timestamp}] ❌ Não foi possível obter o buffer de áudio`);
      console.error(`[${timestamp}]    Tentativas: base64, audioMessage.url, mediaUrl, Evolution API`);
      console.error(`[${timestamp}]    AudioMessage disponível:`, {
        hasUrl: !!audioMessage.url,
        hasMediaUrl: !!audioMessage.mediaUrl,
        hasMediaKey: !!audioMessage.mediaKey
      });
      return null;
    }

    console.log(`[${timestamp}] ✅ Áudio obtido (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
    console.log(`[${timestamp}] 🎙️  Transcrevendo com OpenAI Whisper...`);

    // Create a temporary file for the audio
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Determine file extension based on mimetype or default to ogg
    const mimetype = audioMessage.mimetype || 'audio/ogg; codecs=opus';
    let fileExtension = 'ogg';
    if (mimetype.includes('mp3')) {
      fileExtension = 'mp3';
    } else if (mimetype.includes('mp4') || mimetype.includes('m4a')) {
      fileExtension = 'm4a';
    } else if (mimetype.includes('wav')) {
      fileExtension = 'wav';
    } else if (mimetype.includes('webm')) {
      fileExtension = 'webm';
    }
    
    const tempAudioPath = path.join(tempDir, `audio-${Date.now()}-${phoneNumber}.${fileExtension}`);
    console.log(`[${timestamp}] 💾 Salvando áudio temporário: ${tempAudioPath}`);
    console.log(`[${timestamp}]    Mimetype: ${mimetype}`);
    console.log(`[${timestamp}]    Extensão: ${fileExtension}`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    try {
      // Check audio file size and format
      const audioStats = fs.statSync(tempAudioPath);
      console.log(`[${timestamp}] 📊 Arquivo de áudio criado: ${(audioStats.size / 1024).toFixed(2)} KB`);
      
      // Transcribe using OpenAI Whisper
      console.log(`[${timestamp}] 📤 Enviando para OpenAI Whisper...`);
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempAudioPath),
        model: 'whisper-1',
        language: 'pt', // Portuguese (can be made configurable via env)
      });

      console.log(`[${timestamp}] 📥 Resposta recebida da OpenAI:`, JSON.stringify(transcriptionResponse, null, 2));
      
      const transcription = transcriptionResponse.text?.trim() || '';
      
      // Clean up temp file
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
      
      if (transcription) {
        console.log(`[${timestamp}] ✅ Transcrição concluída: "${transcription}"`);
        return transcription;
      } else {
        console.error(`[${timestamp}] ⚠️  Transcrição vazia ou sem texto`);
        console.error(`[${timestamp}]    Response completa:`, JSON.stringify(transcriptionResponse, null, 2));
        console.error(`[${timestamp}]    Possíveis causas:`);
        console.error(`[${timestamp}]      - Áudio muito curto ou silencioso`);
        console.error(`[${timestamp}]      - Formato de áudio não suportado`);
        console.error(`[${timestamp}]      - Áudio corrompido`);
        return null;
      }
    } catch (transcribeError: any) {
      // Clean up temp file on error
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }
      console.error(`[${timestamp}] ❌ Erro na transcrição:`, transcribeError.message);
      if (transcribeError.response) {
        console.error(`[${timestamp}]    Status: ${transcribeError.response.status}`);
        console.error(`[${timestamp}]    Response:`, JSON.stringify(transcribeError.response.data, null, 2));
      }
      if (transcribeError.error) {
        console.error(`[${timestamp}]    Error object:`, JSON.stringify(transcribeError.error, null, 2));
      }
      // Don't throw - return null so the system can continue processing other messages
      return null;
    }
  } catch (error: any) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[${errorTimestamp}] ❌ Erro ao transcrever áudio:`, error.message);
    if (error.response) {
      console.error(`[${errorTimestamp}]    Response:`, JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

// Function to send catalog image to WhatsApp
async function sendCatalogToWhatsApp(phoneNumber: string, caption: string = ''): Promise<boolean> {
  const timestamp = new Date().toISOString();
  try {
    // Path to catalog image
    const imagePath = path.join(process.cwd(), 'imgs', 'catalog.png');
    
    // Check if image exists
    if (!fs.existsSync(imagePath)) {
      console.error(`[${timestamp}] ❌ Imagem não encontrada: ${imagePath}`);
      return false;
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
    console.log(`[${timestamp}]    Caption: ${caption}`);
    console.log(`[${timestamp}]    Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    
    // Send image via Evolution API
    const response = await axios.post(
      `${EVOLUTION_API_URL}/message/sendMedia/${INSTANCE_NAME}`,
      {
        number: formattedNumber,
        mediatype: 'image',
        media: imageBase64,
        fileName: 'catalog.png',
        caption: caption
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );
    
    if (response.status === 200 || response.status === 201) {
      const messageId = response.data?.key?.id || 'N/A';
      console.log(`[${timestamp}] ✅ Catálogo enviado com sucesso!`);
      console.log(`[${timestamp}]    Message ID: ${messageId}`);
      return true;
    }
    
    return false;
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
    return false;
  }
}


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-ocp-bridge' });
});

// Status endpoint to check OCP WebSocket connection
app.get('/status', (req, res) => {
  try {
    const ocpClient = getOCPClient();
    const ws = (ocpClient as any).ws;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    res.json({
      status: 'ok',
      ocp: {
        connected: isConnected,
        url: process.env.OCP_WS_URL || 'Not configured',
        readyState: ws ? ws.readyState : 'NO_WEBSOCKET',
        sessionId: (ocpClient as any).sessionId || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Agent message endpoint - receives messages from frontend and sends to WhatsApp
app.post('/agent/message', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const { text } = req.body;

    // Validate request
    if (!text) {
      return res.status(400).json({ 
        error: 'Missing required field: text is required' 
      });
    }

    // Always use DEFAULT_PHONE_NUMBER (user/client number) - ignore phoneNumber from body
    const phoneNumber = DEFAULT_PHONE_NUMBER;

    // Check if phone number is in agent mode
    if (!isInAgentMode(phoneNumber)) {
      console.log(`[${timestamp}] ⚠️  Tentativa de enviar mensagem de agente para número não em modo agente: ${phoneNumber}`);
      return res.status(400).json({ 
        error: `Phone number ${phoneNumber} is not in agent mode. Agent mode must be activated first.` 
      });
    }

    console.log(`\n[${timestamp}] 📤 RECEBENDO MENSAGEM DO AGENTE`);
    console.log(`[${timestamp}]    Phone (destinatário): ${phoneNumber}`);
    console.log(`[${timestamp}]    Message: "${text}"`);

    // Format phone number (remove + and spaces)
    const formattedNumber = phoneNumber.replace(/[+\s]/g, '');

    // Send message to WhatsApp via Evolution API
    try {
      const response = await axios.post(
        `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
        {
          number: formattedNumber,
          text: text
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
        const messageId = response.data?.key?.id || 'N/A';
        console.log(`[${timestamp}] ✅ Mensagem do agente enviada para WhatsApp`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);

        // Log BOT message (agent message)
        const logger = getMessageLogger();
        await logger.logBotMessage({
          phoneNumber: phoneNumber,
          text: text,
          messageId: messageId !== 'N/A' ? messageId : undefined
        });

        return res.status(200).json({ 
          success: true, 
          messageId: messageId !== 'N/A' ? messageId : undefined 
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar mensagem do agente para WhatsApp`);
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const errorData = error.response.data;
          let errorMessage: string;
          
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          } else if (errorData?.response?.message) {
            errorMessage = Array.isArray(errorData.response.message) 
              ? errorData.response.message.join(', ') 
              : String(errorData.response.message);
          } else if (errorData?.message) {
            errorMessage = Array.isArray(errorData.message) 
              ? errorData.message.join(', ') 
              : String(errorData.message);
          } else {
            errorMessage = JSON.stringify(errorData);
          }
          
          console.error(`[${errorTimestamp}]    Error: ${errorMessage}`);
          return res.status(500).json({ error: `Failed to send message: ${errorMessage}` });
        }
        if (error.code === 'ECONNREFUSED') {
          console.error(`[${errorTimestamp}]    Evolution API não está acessível`);
          return res.status(503).json({ error: 'Evolution API is not accessible' });
        }
      }
      
      console.error(`[${errorTimestamp}]    Error: ${error.message}`);
      return res.status(500).json({ error: `Failed to send message: ${error.message}` });
    }
  } catch (error: any) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Erro no endpoint /agent/message: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] 🚀 Webhook server started`);
  console.log(`[${timestamp}]    URL: http://localhost:${PORT}`);
  console.log(`[${timestamp}]    Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`[${timestamp}]    Health check: http://localhost:${PORT}/health`);
  
  // Check OpenAI API Key for audio transcription
  if (!OPENAI_API_KEY) {
    console.warn(`\n${'='.repeat(80)}`);
    console.warn(`[${timestamp}] ⚠️  OPENAI_API_KEY não configurada!`);
    console.warn(`[${timestamp}]    A transcrição de áudio não funcionará sem esta chave.`);
    console.warn(`[${timestamp}]    Configure no .env: OPENAI_API_KEY=sk-...`);
    console.warn(`${'='.repeat(80)}\n`);
  } else {
    console.log(`[${timestamp}] ✅ Audio transcription enabled (OpenAI Whisper)`);
  }
  
  const ocpUrl = process.env.OCP_WS_URL || 'Not configured';
  console.log(`[${timestamp}]    OCP WebSocket: ${ocpUrl}`);
  
  if (ocpUrl === 'Not configured' || ocpUrl === 'wss://your-ocp-endpoint.com') {
    console.error(`\n${'='.repeat(80)}`);
    console.error(`[${timestamp}] ⚠️  ATENÇÃO: OCP_WS_URL não está configurado!`);
    console.error(`[${timestamp}]    Configure no .env: OCP_WS_URL=wss://seu-endpoint-ocp.com`);
    console.error(`${'='.repeat(80)}\n`);
  }
  
  console.log(`\n[${timestamp}] 📋 Ready to receive webhooks from Evolution API`);
  console.log(`[${timestamp}] 📋 Ready to connect to OCP WebSocket`);
  console.log(`[${timestamp}] 📋 Agent endpoint: http://localhost:${PORT}/agent/message\n`);
  
  // Initialize OCP client (will try to connect)
  if (ocpUrl !== 'Not configured' && ocpUrl !== 'wss://your-ocp-endpoint.com') {
    console.log(`[${timestamp}] 🔌 Initializing OCP WebSocket connection...`);
    try {
      const ocpClient = getOCPClient();
      console.log(`[${timestamp}] ✅ OCP client initialized - will attempt to connect\n`);
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Failed to initialize OCP client:`, error.message);
    }
  }
});

