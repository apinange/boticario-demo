import axios from 'axios';
import { config } from '../config/env.config';

export class EvolutionApiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanceName: string;

  constructor() {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instanceName = config.instanceName;
  }

  async sendTextMessage(phoneNumber: string, text: string): Promise<string | null> {
    const timestamp = new Date().toISOString();
    try {
      const formattedNumber = phoneNumber.replace(/[+\s-]/g, '');
      
      const response = await axios.post(
        `${this.baseUrl}/message/sendText/${this.instanceName}`,
        {
          number: formattedNumber,
          text: text
        },
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.status === 200 || response.status === 201) {
        const messageId = response.data?.key?.id || null;
        console.log(`[${timestamp}] ✅ Mensagem enviada para WhatsApp`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar mensagem:`, error.message);
      
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        const errorMessage = errorData?.response?.message || errorData?.message || `HTTP ${error.response.status}`;
        console.error(`[${errorTimestamp}]    Error: ${errorMessage}`);
      }
      
      throw error;
    }
  }

  async sendMedia(
    phoneNumber: string,
    mediaType: 'image' | 'audio' | 'video' | 'document',
    mediaBase64: string,
    fileName: string,
    caption?: string
  ): Promise<string | null> {
    const timestamp = new Date().toISOString();
    try {
      const formattedNumber = phoneNumber.replace(/[+\s-]/g, '');
      
      const payload: any = {
        number: formattedNumber,
        mediatype: mediaType,
        media: mediaBase64,
        fileName: fileName
      };
      
      if (caption) {
        payload.caption = caption;
      }
      
      const response = await axios.post(
        `${this.baseUrl}/message/sendMedia/${this.instanceName}`,
        payload,
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      if (response.status === 200 || response.status === 201) {
        const messageId = response.data?.key?.id || null;
        console.log(`[${timestamp}] ✅ Mídia enviada para WhatsApp`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        return messageId;
      }
      
      return null;
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar mídia:`, error.message);
      throw error;
    }
  }
}

export const evolutionApiService = new EvolutionApiService();
