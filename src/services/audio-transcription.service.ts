import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data';
import { config } from '../config/env.config';
import { WhatsAppMessage } from '../types/message.types';

export class AudioTranscriptionService {
  private openai: OpenAI | null;

  constructor() {
    this.openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
  }

  private async downloadAudioFromEvolutionAPI(message: WhatsAppMessage): Promise<Buffer | null> {
    const timestamp = new Date().toISOString();
    
    try {
      console.log(`[${timestamp}] 📥 Baixando áudio da Evolution API...`);
      
      // Download audio from Evolution API using the same method as message-logger
      const mediaResponse = await axios.post(
        `${config.evolutionApiUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`,
        {
          message: {
            key: message.key,
            message: message.message
          }
        },
        {
          headers: {
            apikey: config.evolutionApiKey,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      // Response should contain base64 string
      if (mediaResponse.data?.base64) {
        const audioBuffer = Buffer.from(mediaResponse.data.base64, 'base64');
        console.log(`[${timestamp}] ✅ Áudio baixado (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
        return audioBuffer;
      } else if (mediaResponse.data?.media) {
        const audioBuffer = Buffer.from(mediaResponse.data.media, 'base64');
        console.log(`[${timestamp}] ✅ Áudio baixado (${(audioBuffer.length / 1024).toFixed(2)} KB)`);
        return audioBuffer;
      } else {
        console.warn(`[${timestamp}] ⚠️  Resposta da Evolution API não contém base64 ou media`);
        return null;
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao baixar áudio da Evolution API:`, error.message);
      return null;
    }
  }

  async transcribeAudio(message: WhatsAppMessage, phoneNumber: string): Promise<string | null> {
    if (!this.openai) {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] ⚠️  OpenAI API key not configured. Audio transcription disabled.`);
      return null;
    }

    const timestamp = new Date().toISOString();
    const audioMessage = message.message?.audioMessage;
    
    if (!audioMessage) {
      console.error(`[${timestamp}] ❌ Mensagem não contém áudio`);
      return null;
    }

    try {
      console.log(`[${timestamp}] 🎤 Iniciando transcrição de áudio...`);
      console.log(`[${timestamp}]    Phone: ${phoneNumber}`);
      console.log(`[${timestamp}]    Mimetype: ${audioMessage.mimetype || 'N/A'}`);
      // Note: seconds property may exist in actual message but not in type definition
      const audioMessageAny = audioMessage as any;
      if (audioMessageAny.seconds) {
        console.log(`[${timestamp}]    Seconds: ${audioMessageAny.seconds}`);
      }
      
      // Step 1: Download audio from Evolution API
      const audioBuffer = await this.downloadAudioFromEvolutionAPI(message);
      
      if (!audioBuffer) {
        console.error(`[${timestamp}] ❌ Não foi possível baixar o áudio`);
        return null;
      }

      // Step 2: Create FormData for OpenAI Whisper API
      // Using FormData (like Evolution API does) instead of File API for better Node.js compatibility
      const formData = new FormData();
      const filename = `audio_${Date.now()}.${audioMessage.mimetype?.includes('ogg') ? 'ogg' : 'mp3'}`;
      formData.append('file', audioBuffer, filename);
      formData.append('model', 'whisper-1');
      formData.append('language', 'pt'); // Portuguese
      formData.append('response_format', 'text');

      // Step 3: Transcribe using OpenAI Whisper API directly via HTTP
      console.log(`[${timestamp}] 🎙️  Enviando áudio para OpenAI Whisper...`);
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${config.openaiApiKey}`
          },
          timeout: 60000
        }
      );

      // OpenAI returns text directly when response_format is 'text'
      const transcriptionText = response?.data?.text || '';
      
      if (transcriptionText.trim()) {
        console.log(`[${timestamp}] ✅ Transcrição concluída: "${transcriptionText}"`);
        return transcriptionText.trim();
      } else {
        console.warn(`[${timestamp}] ⚠️  Transcrição vazia`);
        return null;
      }
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao transcrever áudio:`, error.message);
      
      if (error.response) {
        console.error(`[${errorTimestamp}]    Status: ${error.response.status}`);
        console.error(`[${errorTimestamp}]    Data:`, JSON.stringify(error.response.data));
      }
      
      return null;
    }
  }

  isEnabled(): boolean {
    return this.openai !== null;
  }
}

export const audioTranscriptionService = new AudioTranscriptionService();
