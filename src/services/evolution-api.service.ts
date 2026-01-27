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
    const formattedNumber = phoneNumber.replace(/[+\s-]/g, '');
    
    // Try to send message directly - Evolution API will check if instance is in memory
    try {
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
      
      // If 404, instance exists in DB but not loaded in Evolution API memory
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        const errorData = error.response.data;
        let errorMessage = 'Instance not found';
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.response?.message) {
          const msg = errorData.response.message;
          errorMessage = Array.isArray(msg) 
            ? msg.map((m: any) => typeof m === 'string' ? m : JSON.stringify(m)).join(', ')
            : String(msg);
        } else if (errorData?.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : String(errorData.message);
        }
        
        console.error(`[${errorTimestamp}] ❌ Instância não encontrada na memória da Evolution API`);
        console.error(`[${errorTimestamp}]    A instância existe no banco mas não está carregada na memória`);
        console.error(`[${errorTimestamp}]    Tentando conectar a instância para carregá-la na memória...`);
        
        // Try to connect instance to load it into memory
        try {
          await axios.get(
            `${this.baseUrl}/instance/connect/${this.instanceName}`,
            {
              headers: {
                apikey: this.apiKey
              },
              timeout: 10000
            }
          );
          
          console.log(`[${errorTimestamp}] ✅ Comando de conexão enviado, aguardando 2 segundos...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Retry sending the message
          console.log(`[${errorTimestamp}] 🔄 Tentando enviar mensagem novamente...`);
          const retryResponse = await axios.post(
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
          
          if (retryResponse.status === 200 || retryResponse.status === 201) {
            const messageId = retryResponse.data?.key?.id || null;
            console.log(`[${errorTimestamp}] ✅ Mensagem enviada com sucesso após reconexão!`);
            console.log(`[${errorTimestamp}]    Message ID: ${messageId}`);
            return messageId;
          }
        } catch (connectError: any) {
          console.error(`[${errorTimestamp}] ❌ Falha ao conectar instância:`, connectError.message);
        }
        
        // If retry failed, throw original error with helpful message
        console.error(`[${errorTimestamp}] 💡 Dica: A instância precisa estar carregada na memória da Evolution API`);
        console.error(`[${errorTimestamp}]    Tente: POST /api/instances/reconnect?instanceName=${this.instanceName}`);
        console.error(`[${errorTimestamp}]    Ou recrie: GET /api/instances/qr?instanceName=${this.instanceName}`);
        
        throw new Error(`Instance "${this.instanceName}" is not loaded in Evolution API memory. Error: ${errorMessage}`);
      }
      
      // Handle other errors
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar mensagem:`, error.message);
      
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data;
        let errorMessage: string;
        
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.response?.message) {
          const msg = errorData.response.message;
          errorMessage = Array.isArray(msg) 
            ? msg.map((m: any) => typeof m === 'string' ? m : JSON.stringify(m)).join(', ')
            : String(msg);
        } else if (errorData?.message) {
          errorMessage = Array.isArray(errorData.message) 
            ? errorData.message.join(', ') 
            : String(errorData.message);
        } else {
          errorMessage = `HTTP ${error.response.status}`;
        }
        
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
