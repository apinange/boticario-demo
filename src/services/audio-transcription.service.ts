import OpenAI from 'openai';
import axios from 'axios';
import { config } from '../config/env.config';
import { WhatsAppMessage } from '../types/message.types';

export class AudioTranscriptionService {
  private openai: OpenAI | null;

  constructor() {
    this.openai = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
  }

  async transcribeAudio(message: WhatsAppMessage, phoneNumber: string): Promise<string | null> {
    if (!this.openai) {
      console.warn('OpenAI API key not configured. Audio transcription disabled.');
      return null;
    }

    const timestamp = new Date().toISOString();
    const audioMessage = message.message?.audioMessage;
    
    if (!audioMessage || !audioMessage.id) {
      console.error(`[${timestamp}] ❌ Mensagem de áudio sem ID`);
      return null;
    }

    try {
      // Download audio from Evolution API
      const audioUrl = `${config.evolutionApiUrl}/chat/fetchMessages/${config.instanceName}`;
      // Note: This is a simplified version - you may need to adjust based on Evolution API structure
      
      console.log(`[${timestamp}] 🎤 Transcrevendo áudio...`);
      console.log(`[${timestamp}]    Audio ID: ${audioMessage.id}`);
      
      // For now, return null as we need the actual audio file URL
      // This would require fetching the audio file from Evolution API first
      console.warn(`[${timestamp}] ⚠️  Transcrição de áudio requer implementação adicional`);
      
      return null;
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao transcrever áudio:`, error.message);
      return null;
    }
  }

  isEnabled(): boolean {
    return this.openai !== null;
  }
}

export const audioTranscriptionService = new AudioTranscriptionService();
