import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import * as crypto from 'crypto';

dotenv.config();

const LOGGING_ENDPOINT_URL = process.env.LOGGING_ENDPOINT_URL || '';
const EVOLUTION_API_URL = process.env.SERVER_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.AUTHENTICATION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const INSTANCE_NAME = process.env.INSTANCE_NAME || 'default';

interface LogMessage {
  flag: 'USER' | 'BOT';
  timestamp: string;
  message_id: string;
  conversation_id: string;
  user_id?: string;
  text: string;
  images?: Buffer[];
  audios?: Buffer[];
  imageMimetypes?: string[];
  audioMimetypes?: string[];
  imageFilenames?: string[];
  audioFilenames?: string[];
}

interface QueuedLog {
  logMessage: LogMessage;
  retryCount: number;
  nextRetryAt: number;
}

class MessageLogger {
  private queue: QueuedLog[] = [];
  private isProcessing = false;
  private conversationIds: Map<string, string> = new Map();
  private maxRetries = 5;
  private retryDelays = [1000, 3000, 10000, 30000, 60000]; 

  constructor() {
    if (!LOGGING_ENDPOINT_URL) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] ⚠️  LOGGING_ENDPOINT_URL não configurado. Logging de mensagens desabilitado.`);
      console.warn(`[${timestamp}]    Configure LOGGING_ENDPOINT_URL no .env para habilitar`);
    } else {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] 📊 Sistema de logging habilitado`);
      console.log(`[${timestamp}]    Endpoint: ${LOGGING_ENDPOINT_URL}`);
    }
  }

  /**
   * Get or create conversation ID for a phone number
   */
  private getConversationId(phoneNumber: string): string {
    if (!this.conversationIds.has(phoneNumber)) {
      this.conversationIds.set(phoneNumber, crypto.randomUUID());
    }
    return this.conversationIds.get(phoneNumber)!;
  }

  /**
   * Download media from Evolution API and return as Buffer
   */
  private async downloadMediaFromEvolutionAPI(message: any, mediaType: 'image' | 'audio' | 'video' | 'document'): Promise<Buffer | null> {
    const timestamp = new Date().toISOString();
    
    try {
      // Try to get decrypted media from Evolution API
      const mediaResponse = await axios.post(
        `${EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${INSTANCE_NAME}`,
        {
          message: {
            key: message.key,
            message: message.message
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
        return Buffer.from(mediaResponse.data.base64, 'base64');
      } else if (mediaResponse.data?.media) {
        return Buffer.from(mediaResponse.data.media, 'base64');
      } else {
        console.warn(`[${timestamp}] ⚠️  Resposta da Evolution API não contém base64 ou media`);
        return null;
      }
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Erro ao baixar mídia da Evolution API:`, error.message);
      return null;
    }
  }

  /**
   * Extract media from WhatsApp message
   */
  private async extractMediaFromMessage(message: any): Promise<{
    images: { buffer: Buffer; mimetype: string; filename: string }[];
    audios: { buffer: Buffer; mimetype: string; filename: string }[];
  }> {
    const images: { buffer: Buffer; mimetype: string; filename: string }[] = [];
    const audios: { buffer: Buffer; mimetype: string; filename: string }[] = [];

    const timestamp = new Date().toISOString();

    // Check for image message
    const imageMessage = message.message?.imageMessage;
    if (imageMessage) {
      const buffer = await this.downloadMediaFromEvolutionAPI(message, 'image');
      if (buffer) {
        const mimetype = imageMessage.mimetype || 'image/jpeg';
        const filename = `image_${Date.now()}.${mimetype.split('/')[1]?.split(';')[0] || 'jpg'}`;
        images.push({ buffer, mimetype, filename });
        console.log(`[${timestamp}] 📷 Imagem extraída para logging: ${(buffer.length / 1024).toFixed(2)} KB`);
      }
    }

    // Check for video message
    const videoMessage = message.message?.videoMessage;
    if (videoMessage) {
      const buffer = await this.downloadMediaFromEvolutionAPI(message, 'video');
      if (buffer) {
        const mimetype = videoMessage.mimetype || 'video/mp4';
        const filename = `video_${Date.now()}.${mimetype.split('/')[1]?.split(';')[0] || 'mp4'}`;
        // Treat video as image for logging purposes (or create separate handling)
        images.push({ buffer, mimetype, filename });
        console.log(`[${timestamp}] 🎥 Vídeo extraído para logging: ${(buffer.length / 1024).toFixed(2)} KB`);
      }
    }

    // Check for audio message
    const audioMessage = message.message?.audioMessage;
    if (audioMessage) {
      const buffer = await this.downloadMediaFromEvolutionAPI(message, 'audio');
      if (buffer) {
        const mimetype = audioMessage.mimetype || 'audio/ogg';
        const filename = `audio_${Date.now()}.${mimetype.split('/')[1]?.split(';')[0]?.split(' ')[0] || 'ogg'}`;
        audios.push({ buffer, mimetype, filename });
        console.log(`[${timestamp}] 🎤 Áudio extraído para logging: ${(buffer.length / 1024).toFixed(2)} KB`);
      }
    }

    // Check for document message
    const documentMessage = message.message?.documentMessage;
    if (documentMessage) {
      const buffer = await this.downloadMediaFromEvolutionAPI(message, 'document');
      if (buffer) {
        const mimetype = documentMessage.mimetype || 'application/octet-stream';
        const filename = documentMessage.fileName || `document_${Date.now()}`;
        // Could be image, audio, or other - check mimetype
        if (mimetype.startsWith('image/')) {
          images.push({ buffer, mimetype, filename });
        } else if (mimetype.startsWith('audio/')) {
          audios.push({ buffer, mimetype, filename });
        }
        console.log(`[${timestamp}] 📄 Documento extraído para logging: ${(buffer.length / 1024).toFixed(2)} KB`);
      }
    }

    return { images, audios };
  }

  /**
   * Log a message to the external endpoint
   */
  public async logMessage(params: {
    flag: 'USER' | 'BOT';
    phoneNumber: string;
    text: string;
    message?: any; // WhatsApp message object (for extracting media)
    messageId?: string;
    userId?: string;
  }): Promise<void> {
    if (!LOGGING_ENDPOINT_URL) {
      return; // Logging disabled
    }

    const timestamp = new Date().toISOString();
    const messageId = params.messageId || crypto.randomUUID();
    const conversationId = this.getConversationId(params.phoneNumber);

    const logMessage: LogMessage = {
      flag: params.flag,
      timestamp,
      message_id: messageId,
      conversation_id: conversationId,
      user_id: params.userId || params.phoneNumber,
      text: params.text || '',
      images: [],
      audios: [],
      imageMimetypes: [],
      audioMimetypes: [],
      imageFilenames: [],
      audioFilenames: []
    };

    // Extract media if message object is provided
    if (params.message) {
      try {
        const media = await this.extractMediaFromMessage(params.message);
        logMessage.images = media.images.map(img => img.buffer);
        logMessage.audios = media.audios.map(aud => aud.buffer);
        logMessage.imageMimetypes = media.images.map(img => img.mimetype);
        logMessage.audioMimetypes = media.audios.map(aud => aud.mimetype);
        logMessage.imageFilenames = media.images.map(img => img.filename);
        logMessage.audioFilenames = media.audios.map(aud => aud.filename);
      } catch (error: any) {
        console.error(`[${timestamp}] ⚠️  Erro ao extrair mídia para logging:`, error.message);
        // Continue without media
      }
    }

    // Send immediately (non-blocking)
    this.sendLogMessage(logMessage).catch(error => {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar log (será reenviado):`, error.message);
      // Queue for retry
      this.queueLogMessage(logMessage);
    });
  }

  /**
   * Log a BOT message with optional image
   */
  public async logBotMessage(params: {
    phoneNumber: string;
    text: string;
    imagePath?: string; // Path to local image file (e.g., catalog)
    messageId?: string;
  }): Promise<void> {
    if (!LOGGING_ENDPOINT_URL) {
      return; // Logging disabled
    }

    const timestamp = new Date().toISOString();
    const messageId = params.messageId || crypto.randomUUID();
    const conversationId = this.getConversationId(params.phoneNumber);

    const logMessage: LogMessage = {
      flag: 'BOT',
      timestamp,
      message_id: messageId,
      conversation_id: conversationId,
      user_id: params.phoneNumber,
      text: params.text || '',
      images: [],
      audios: [],
      imageMimetypes: [],
      audioMimetypes: [],
      imageFilenames: [],
      audioFilenames: []
    };

    // Add image if provided
    if (params.imagePath && fs.existsSync(params.imagePath)) {
      try {
        const imageBuffer = fs.readFileSync(params.imagePath);
        if (logMessage.images) {
          logMessage.images.push(imageBuffer);
        }
        const ext = path.extname(params.imagePath).toLowerCase();
        const mimetype = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/jpeg';
        if (logMessage.imageMimetypes) {
          logMessage.imageMimetypes.push(mimetype);
        }
        if (logMessage.imageFilenames) {
          logMessage.imageFilenames.push(path.basename(params.imagePath));
        }
        console.log(`[${timestamp}] 📷 Imagem adicionada ao log: ${path.basename(params.imagePath)}`);
      } catch (error: any) {
        console.error(`[${timestamp}] ⚠️  Erro ao ler imagem para logging:`, error.message);
      }
    }

    // Send immediately (non-blocking)
    this.sendLogMessage(logMessage).catch(error => {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar log (será reenviado):`, error.message);
      // Queue for retry
      this.queueLogMessage(logMessage);
    });
  }

  /**
   * Send log message to endpoint
   */
  private async sendLogMessage(logMessage: LogMessage): Promise<void> {
    const timestamp = new Date().toISOString();
    
    try {
      const formData = new FormData();

      // Add form fields
      formData.append('flag', logMessage.flag);
      formData.append('timestamp', logMessage.timestamp);
      formData.append('message_id', logMessage.message_id);
      formData.append('conversation_id', logMessage.conversation_id);
      if (logMessage.user_id) {
        formData.append('user_id', logMessage.user_id);
      }
      formData.append('text', logMessage.text || '');

      // Add images
      const images = logMessage.images || [];
      if (images.length > 0) {
        images.forEach((imageBuffer, index) => {
          const mimetype = logMessage.imageMimetypes?.[index] || 'image/jpeg';
          const filename = logMessage.imageFilenames?.[index] || `image_${index + 1}.jpg`;
          formData.append(`image_${index + 1}`, imageBuffer, {
            filename: filename,
            contentType: mimetype
          });
        });
      }

      // Add audios
      const audios = logMessage.audios || [];
      if (audios.length > 0) {
        audios.forEach((audioBuffer, index) => {
          const mimetype = logMessage.audioMimetypes?.[index] || 'audio/ogg';
          const filename = logMessage.audioFilenames?.[index] || `audio_${index + 1}.ogg`;
          formData.append(`audio_${index + 1}`, audioBuffer, {
            filename: filename,
            contentType: mimetype
          });
        });
      }

      console.log(`[${timestamp}] 📤 Enviando log para endpoint externo`);
      console.log(`[${timestamp}]    Flag: ${logMessage.flag}`);
      console.log(`[${timestamp}]    Conversation ID: ${logMessage.conversation_id}`);
      console.log(`[${timestamp}]    Message ID: ${logMessage.message_id}`);
      console.log(`[${timestamp}]    Text: "${logMessage.text.substring(0, 50)}${logMessage.text.length > 50 ? '...' : ''}"`);
      console.log(`[${timestamp}]    Images: ${logMessage.images?.length || 0}`);
      console.log(`[${timestamp}]    Audios: ${logMessage.audios?.length || 0}`);

      const response = await axios.post(LOGGING_ENDPOINT_URL, formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 30000, // 30 seconds timeout
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.status >= 200 && response.status < 300) {
        console.log(`[${timestamp}] ✅ Log enviado com sucesso (${response.status})`);
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error(`[${errorTimestamp}] ❌ Erro ao enviar log: HTTP ${error.response.status}`);
          console.error(`[${errorTimestamp}]    Response:`, JSON.stringify(error.response.data, null, 2));
        } else if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          console.error(`[${errorTimestamp}] ❌ Timeout ao enviar log`);
        } else {
          console.error(`[${errorTimestamp}] ❌ Erro de rede ao enviar log:`, error.message);
        }
      } else {
        console.error(`[${errorTimestamp}] ❌ Erro ao enviar log:`, error.message);
      }
      throw error; // Re-throw to trigger retry queue
    }
  }

  /**
   * Queue log message for retry
   */
  private queueLogMessage(logMessage: LogMessage): void {
    this.queue.push({
      logMessage,
      retryCount: 0,
      nextRetryAt: Date.now() + this.retryDelays[0]
    });
    
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📋 Log enfileirado para retry (${this.queue.length} na fila)`);
    
    // Start processing queue if not already processing
    this.processQueue();
  }

  /**
   * Process retry queue with exponential backoff
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔄 Processando fila de logs (${this.queue.length} item(s))`);

    while (this.queue.length > 0) {
      const now = Date.now();
      const readyItems = this.queue.filter(item => item.nextRetryAt <= now);
      
      if (readyItems.length === 0) {
        // Wait for next retry
        const nextRetry = Math.min(...this.queue.map(item => item.nextRetryAt));
        const waitTime = nextRetry - now;
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }

      const item = this.queue.shift();
      if (!item) continue;

      try {
        await this.sendLogMessage(item.logMessage);
        const successTimestamp = new Date().toISOString();
        console.log(`[${successTimestamp}] ✅ Log reenviado com sucesso após ${item.retryCount} tentativa(s)`);
      } catch (error: any) {
        item.retryCount++;
        
        if (item.retryCount >= this.maxRetries) {
          const errorTimestamp = new Date().toISOString();
          console.error(`[${errorTimestamp}] ❌ Log descartado após ${this.maxRetries} tentativas`);
          console.error(`[${errorTimestamp}]    Conversation ID: ${item.logMessage.conversation_id}`);
          console.error(`[${errorTimestamp}]    Message ID: ${item.logMessage.message_id}`);
        } else {
          const delay = this.retryDelays[Math.min(item.retryCount - 1, this.retryDelays.length - 1)];
          item.nextRetryAt = Date.now() + delay;
          this.queue.push(item);
          const retryTimestamp = new Date().toISOString();
          console.log(`[${retryTimestamp}] ⏳ Log reagendado (tentativa ${item.retryCount}/${this.maxRetries}) em ${delay}ms`);
        }
      }
    }

    this.isProcessing = false;
    const finishTimestamp = new Date().toISOString();
    console.log(`[${finishTimestamp}] ✅ Fila de logs processada`);
  }
}

// Export singleton instance
let messageLogger: MessageLogger | null = null;

export function getMessageLogger(): MessageLogger {
  if (!messageLogger) {
    messageLogger = new MessageLogger();
  }
  return messageLogger;
}

export { MessageLogger };

