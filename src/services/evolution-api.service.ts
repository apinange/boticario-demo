import axios from 'axios';
import { config } from '../config/env.config';
import { instanceService } from './instance.service';

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
    
    // Verify instance exists before sending
    try {
      const instances = await instanceService.fetchInstances();
      console.log(`[${timestamp}] 🔍 Verificando instância "${this.instanceName}"...`);
      console.log(`[${timestamp}]    Total de instâncias encontradas: ${instances.length}`);
      
      const instanceExists = instances.some(
        (inst: any) => {
          const instanceName = inst.name || 
                              inst.instanceName || 
                              inst.instance?.instanceName || 
                              inst.instance?.name;
          const matches = instanceName === this.instanceName;
          if (matches) {
            console.log(`[${timestamp}] ✅ Instância encontrada: "${instanceName}" (connectionStatus: ${inst.connectionStatus || 'N/A'})`);
          }
          return matches;
        }
      );
      
      if (!instanceExists) {
        console.log(`[${timestamp}] 📋 Instâncias disponíveis:`, instances.map((inst: any) => {
          const name = inst.name || inst.instanceName || inst.instance?.instanceName || inst.instance?.name || 'N/A';
          return `"${name}"`;
        }).join(', '));
        const errorMsg = `Instance "${this.instanceName}" does not exist. Please create it first using POST /api/instances or GET /api/instances/qr`;
        console.error(`[${timestamp}] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
    } catch (checkError: any) {
      // If it's our custom error, throw it
      if (checkError.message.includes('does not exist')) {
        throw checkError;
      }
      // Otherwise, log warning but continue (check might fail for other reasons)
      console.warn(`[${timestamp}] ⚠️  Não foi possível verificar a instância (continuando mesmo assim):`, checkError.message);
    }
    
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
        let errorMessage: string;
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.response?.message) {
          const msg = errorData.response.message;
          if (Array.isArray(msg)) {
            errorMessage = msg.map((m: any) => typeof m === 'string' ? m : JSON.stringify(m)).join(', ');
          } else {
            errorMessage = String(msg);
          }
        } else if (errorData?.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : String(errorData.message);
        } else {
          errorMessage = `HTTP ${error.response.status}`;
        }
        
        console.error(`[${errorTimestamp}]    Error: ${errorMessage}`);
        
        // If instance doesn't exist, provide helpful message
        if (error.response.status === 404 && errorMessage.includes('does not exist')) {
          console.error(`[${errorTimestamp}] 💡 Dica: Crie a instância usando: GET /api/instances/qr?instanceName=${this.instanceName}`);
        }
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
