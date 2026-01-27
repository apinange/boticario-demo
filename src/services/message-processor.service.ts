import WebSocket from 'ws';
import { getOCPClient } from '../core/ocp-websocket';
import { getMessageLogger } from '../core/message-logger';
import { botMessageTracker } from '../utils/bot-message-tracker';
import { isInAgentMode, setAgentMode } from '../features/agent-mode';
import { escalationService } from './escalation.service';
import { evolutionApiService } from './evolution-api.service';
import { audioTranscriptionService } from './audio-transcription.service';
import { validatePhoneNumber } from '../middleware/phone-validation.middleware';
import { filterGroupMessages, filterSelfMessages, filterValidMessages } from '../middleware/message-filter.middleware';
import { WhatsAppMessage, WebhookEvent } from '../types/message.types';
import { config } from '../config/env.config';

export class MessageProcessorService {
  async processWebhookEvent(event: WebhookEvent): Promise<void> {
    const timestamp = new Date().toISOString();

    // Handle different event types
    if (event.event === 'MESSAGES_UPSERT' || event.event === 'MESSAGES_SET' || event.event === 'messages.upsert') {
      // Data can be a single message object or array
      const messageData = Array.isArray(event.data) ? event.data : [event.data];
      
      // Filter messages
      let messages = filterGroupMessages(messageData);
      messages = filterSelfMessages(messages);
      messages = filterValidMessages(messages);
      
      // Only log webhook if there are messages to process
      if (messages.length > 0) {
        console.log(`\n[${timestamp}] 📥 Webhook received from Evolution API`);
        console.log(`[${timestamp}]    Event: ${event.event || 'unknown'}`);
        console.log(`[${timestamp}]    Instance: ${event.instance || 'unknown'}`);
        console.log(`[${timestamp}] 📦 Processing ${messages.length} message(s)`);
      }
      
      // Process each message
      for (const message of messages) {
        await this.processMessage(message, timestamp);
      }
    } else {
      console.log(`[${timestamp}] ℹ️  Event type não processado: ${event.event}`);
    }
  }

  private async processMessage(message: WhatsAppMessage, timestamp: string): Promise<void> {
    const remoteJid = message.key?.remoteJid || '';
    const phoneNumber = remoteJid.split('@')[0] || 'unknown';
    
    console.log(`[${timestamp}] 🔍 Processando mensagem:`);
    console.log(`[${timestamp}]    RemoteJid: ${remoteJid}`);
    console.log(`[${timestamp}]    PhoneNumber extraído: ${phoneNumber}`);
    console.log(`[${timestamp}]    DEFAULT_PHONE_NUMBER configurado: ${config.defaultPhoneNumber}`);
    
    // Validate phone number
    const normalizedPhone = phoneNumber.replace(/[+\s-]/g, '');
    const normalizedDefault = config.defaultPhoneNumber.replace(/[+\s-]/g, '');
    
    if (normalizedPhone !== normalizedDefault) {
      console.log(`[${timestamp}] ⚠️  Número não autorizado: ${phoneNumber} (normalizado: ${normalizedPhone})`);
      console.log(`[${timestamp}]    Número esperado: ${config.defaultPhoneNumber} (normalizado: ${normalizedDefault})`);
      console.log(`[${timestamp}]    Mensagem ignorada.`);
      return;
    }

    console.log(`[${timestamp}] ✅ Número autorizado: ${phoneNumber}`);

    // Check for audio message
    const audioMessage = message.message?.audioMessage;
    if (audioMessage) {
      await this.processAudioMessage(message, phoneNumber, timestamp);
      return;
    }

    // Check for media messages with caption
    const mediaCaption = this.extractMediaCaption(message);
    if (mediaCaption) {
      await this.processMediaWithCaption(message, phoneNumber, mediaCaption, timestamp);
      return;
    }

    // Check for media without caption
    const hasMedia = this.hasMediaWithoutCaption(message);
    if (hasMedia) {
      await this.processMediaWithoutCaption(message, phoneNumber, timestamp);
      return;
    }

    // Process text message
    const text = this.extractText(message);
    if (text && text.trim()) {
      await this.processTextMessage(message, phoneNumber, text, timestamp);
    } else {
      console.log(`[${timestamp}] ⚠️  Mensagem sem texto ou vazia, ignorando...`);
    }
  }

  private async processAudioMessage(message: WhatsAppMessage, phoneNumber: string, timestamp: string): Promise<void> {
    console.log(`\n[${timestamp}] 🎤 MENSAGEM DE ÁUDIO DETECTADA`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    
    try {
      const transcription = await audioTranscriptionService.transcribeAudio(message, phoneNumber);
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
          
          // Log USER message with audio
          const logger = getMessageLogger();
          await logger.logMessage({
            flag: 'USER',
            phoneNumber: phoneNumber,
            text: transcription,
            message: message,
            messageId: message.key?.id
          });
          
          // Create a message-like object with the transcription
          const transcriptionMessage: WhatsAppMessage = {
            ...message,
            message: {
              conversation: transcription
            }
          };
          
          await ocpClient.handleIncomingWhatsAppMessage(transcriptionMessage);
          console.log(`[${timestamp}] ✅ Transcrição enviada para OCP`);
        }
      } else {
        console.error(`[${timestamp}] ❌ Falha ao transcrever áudio`);
      }
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Erro ao processar áudio:`, error.message);
    }
  }

  private async processMediaWithCaption(
    message: WhatsAppMessage,
    phoneNumber: string,
    caption: string,
    timestamp: string
  ): Promise<void> {
    console.log(`\n[${timestamp}] 📎 MENSAGEM DE MÍDIA COM TEXTO DETECTADA`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    console.log(`[${timestamp}]    Caption: "${caption}"`);
    
    const ocpClient = getOCPClient();
    const ws = (ocpClient as any).ws;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    if (!isConnected) {
      console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
    } else {
      console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando texto da mídia...`);
      
      // Log USER message with media
      const logger = getMessageLogger();
      await logger.logMessage({
        flag: 'USER',
        phoneNumber: phoneNumber,
        text: caption,
        message: message,
        messageId: message.key?.id
      });
      
      // Create a message-like object with the caption text
      const mediaTextMessage: WhatsAppMessage = {
        ...message,
        message: {
          conversation: caption
        }
      };
      
      await ocpClient.handleIncomingWhatsAppMessage(mediaTextMessage);
      console.log(`[${timestamp}] ✅ Texto da mídia enviado para OCP`);
    }
  }

  private async processMediaWithoutCaption(
    message: WhatsAppMessage,
    phoneNumber: string,
    timestamp: string
  ): Promise<void> {
    console.log(`[${timestamp}] 📎 Mensagem de mídia sem caption`);
    
    // Count images in this message
    const imageCount = 1; // Each message with media = 1 image
    console.log(`[${timestamp}] 📸 Imagem detectada (${imageCount} imagem nesta mensagem)`);
    
    // Record images and check if we should send "sim" to OCP
    const shouldSendYes = botMessageTracker.recordImage(phoneNumber, imageCount);
    
    // Log USER message with media
    const logger = getMessageLogger();
    await logger.logMessage({
      flag: 'USER',
      phoneNumber: phoneNumber,
      text: '', // No caption
      message: message,
      messageId: message.key?.id
    });
    
    // If we received 3+ images, send "sim" to OCP
    if (shouldSendYes) {
      console.log(`[${timestamp}] 🎯 3+ imagens recebidas! Enviando "sim" para OCP`);
      
      const ocpClient = getOCPClient();
      const ws = (ocpClient as any).ws;
      const isConnected = ws && ws.readyState === WebSocket.OPEN;
      
      if (!isConnected) {
        console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
      } else {
        console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando "sim"...`);
        
        // Create a message-like object with "sim" as text
        const yesMessage: WhatsAppMessage = {
          ...message,
          message: {
            conversation: 'sim'
          }
        };
        
        await ocpClient.handleIncomingWhatsAppMessage(yesMessage);
        console.log(`[${timestamp}] ✅ "sim" enviado para OCP`);
      }
    }
  }

  private async processTextMessage(
    message: WhatsAppMessage,
    phoneNumber: string,
    text: string,
    timestamp: string
  ): Promise<void> {
    console.log(`\n[${timestamp}] 📱 PROCESSANDO MENSAGEM DO WHATSAPP`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    console.log(`[${timestamp}]    Message: "${text}"`);
    
    // Log USER message first
    const logger = getMessageLogger();
    await logger.logMessage({
      flag: 'USER',
      phoneNumber: phoneNumber,
      text: text,
      message: message,
      messageId: message.key?.id
    });
    
    // Check if user message indicates need for escalation
    const needsEscalation = escalationService.shouldEscalateToAgent(text);
    if (needsEscalation && !isInAgentMode(phoneNumber)) {
      await this.handleEscalation(phoneNumber, text, timestamp);
      return;
    }
    
    // Check if phone number is in agent mode
    if (isInAgentMode(phoneNumber)) {
      console.log(`[${timestamp}] 🚨 Modo agente ativo para ${phoneNumber} - mensagem não será enviada para OCP`);
      console.log(`[${timestamp}]    A mensagem será apenas logada. O agente pode responder via POST /agent/message`);
      return;
    }
    
    // Send to OCP
    const ocpClient = getOCPClient();
    const ws = (ocpClient as any).ws;
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    
    if (!isConnected) {
      console.error(`[${timestamp}] ⚠️  OCP WebSocket não está conectado!`);
      console.error(`[${timestamp}]    Verifique a conexão com o OCP`);
    } else {
      console.log(`[${timestamp}] ✅ OCP WebSocket está conectado, enviando mensagem...`);
      await ocpClient.handleIncomingWhatsAppMessage(message);
      console.log(`[${timestamp}] ✅ Mensagem enviada para OCP`);
    }
  }

  private async handleEscalation(phoneNumber: string, text: string, timestamp: string): Promise<void> {
    console.log(`\n[${timestamp}] 🚨 NECESSIDADE DE ESCALAÇÃO DETECTADA NA MENSAGEM DO USUÁRIO!`);
    console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
    console.log(`[${timestamp}]    Message: "${text}"`);
    console.log(`[${timestamp}]    Ativando modo agente automaticamente`);
    
    // Activate agent mode
    setAgentMode(phoneNumber, true);
    
    // Send escalation message to WhatsApp
    try {
      const escalationMessage = 'Entendi. Como sua dúvida é sobre a baixa de valores e liberação de crédito para compras, vamos te escalar para um de nossos agentes para te ajudar.';
      
      const messageId = await evolutionApiService.sendTextMessage(phoneNumber, escalationMessage);
      
      if (messageId) {
        console.log(`[${timestamp}] ✅ Mensagem de escalação enviada para WhatsApp`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        
        // Log BOT message (escalation message)
        const logger = getMessageLogger();
        await logger.logBotMessage({
          phoneNumber: phoneNumber,
          text: escalationMessage,
          messageId: messageId
        });
      }
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Erro ao enviar mensagem de escalação: ${error.message}`);
    }
    
    console.log(`[${timestamp}]    ✅ Modo agente ativado. Mensagens futuras não serão enviadas para OCP.`);
    console.log(`[${timestamp}]    📡 Frontend pode enviar mensagens via POST /agent/message\n`);
  }

  private extractText(message: WhatsAppMessage): string {
    return message.message?.conversation || 
           message.message?.extendedTextMessage?.text ||
           '';
  }

  private extractMediaCaption(message: WhatsAppMessage): string | null {
    const imageMessage = message.message?.imageMessage;
    const videoMessage = message.message?.videoMessage;
    const documentMessage = message.message?.documentMessage;
    
    if (imageMessage?.caption) return imageMessage.caption;
    if (videoMessage?.caption) return videoMessage.caption;
    if (documentMessage?.caption) return documentMessage.caption;
    
    return null;
  }

  private hasMediaWithoutCaption(message: WhatsAppMessage): boolean {
    const imageMessage = message.message?.imageMessage;
    const videoMessage = message.message?.videoMessage;
    const documentMessage = message.message?.documentMessage;
    
    return !!(imageMessage || videoMessage || documentMessage) && !this.extractMediaCaption(message);
  }
}

export const messageProcessorService = new MessageProcessorService();
