import axios from 'axios';
import { config } from '../config/env.config';
import { instanceService } from './instance.service';

export class WebhookConfigService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanceName: string;

  constructor() {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instanceName = config.instanceName;
  }

  /**
   * Get the webhook URL based on environment or construct from request
   */
  private getWebhookUrl(req?: any): string {
    // Try environment variable first (for Render/production)
    // Render provides RENDER_EXTERNAL_URL for web services
    const envWebhookUrl = process.env.WEBHOOK_SERVER_URL || 
                         process.env.WHATSAPP_INTEGRATION_URL ||
                         process.env.RENDER_EXTERNAL_URL;
    
    if (envWebhookUrl && !envWebhookUrl.includes('localhost') && !envWebhookUrl.includes('127.0.0.1')) {
      return `${envWebhookUrl.replace(/\/$/, '')}/webhook`;
    }
    
    // Try to get from request (for dynamic detection)
    if (req) {
      const protocol = req.protocol || (req.secure ? 'https' : 'http');
      const host = req.get('host') || req.hostname;
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
        return `${protocol}://${host}/webhook`;
      }
    }
    
    // Check if we're in production (Render sets NODE_ENV=production)
    // If in production but no URL found, log warning
    if (process.env.NODE_ENV === 'production') {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] ⚠️  Não foi possível detectar a URL do webhook em produção!`);
      console.warn(`[${timestamp}]    Configure WEBHOOK_SERVER_URL ou WHATSAPP_INTEGRATION_URL no Render`);
      console.warn(`[${timestamp}]    Usando localhost como fallback (pode não funcionar)`);
    }
    
    // Fallback to localhost (for development only)
    return `http://localhost:${config.port}/webhook`;
  }

  /**
   * Auto-setup webhook (used internally)
   */
  async autoSetupWebhook(instanceName?: string, req?: any): Promise<void> {
    const name = instanceName || this.instanceName;
    const webhookUrl = this.getWebhookUrl(req);
    
    try {
      await this.setupWebhook(webhookUrl, name);
    } catch (error: any) {
      // Silently fail - don't throw, just log
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] ⚠️  Auto webhook setup failed (non-critical):`, error.message);
    }
  }

  async setupWebhook(webhookUrl: string, instanceName?: string): Promise<any> {
    const name = instanceName || this.instanceName;
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] 🔧 Configurando webhook para instância "${name}"...`);
    console.log(`[${timestamp}]    Evolution API URL: ${this.baseUrl}`);
    console.log(`[${timestamp}]    Webhook URL: ${webhookUrl}`);
    
    // First, verify that the instance exists
    try {
      console.log(`[${timestamp}] 🔍 Verificando se a instância "${name}" existe...`);
      const instances = await instanceService.fetchInstances();
      const instanceExists = instances.some(
        (inst: any) => {
          // Try multiple possible field names
          const instanceName = inst.name || 
                              inst.instanceName || 
                              inst.instance?.instanceName || 
                              inst.instance?.name;
          return instanceName === name;
        }
      );
      
      if (!instanceExists) {
        const errorMsg = `Instance "${name}" does not exist. Please create it first using POST /api/instances or GET /api/instances/qr?instanceName=${name}`;
        console.error(`[${timestamp}] ❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
      
      console.log(`[${timestamp}] ✅ Instância "${name}" encontrada`);
    } catch (checkError: any) {
      // If it's our custom error, throw it
      if (checkError.message.includes('does not exist')) {
        throw checkError;
      }
      // Otherwise, log warning but continue (instance check might fail for other reasons)
      console.warn(`[${timestamp}] ⚠️  Não foi possível verificar a instância (continuando mesmo assim):`, checkError.message);
    }
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/webhook/set/${name}`,
        {
          webhook: {
            enabled: true,
            url: webhookUrl,
            webhookByEvents: true,
            webhookBase64: false,
            events: [
              'MESSAGES_UPSERT',
              'MESSAGES_SET',
              'MESSAGES_UPDATE',
              'CONNECTION_UPDATE',
              'QRCODE_UPDATED'
            ]
          }
        },
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (response.status === 200 || response.status === 201) {
        console.log(`[${timestamp}] ✅ Webhook configurado com sucesso!`);
        return response.data;
      }
      
      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          const errorMsg = `Cannot connect to Evolution API at ${this.baseUrl}. Verifique se a Evolution API está rodando e se a URL está correta.`;
          console.error(`[${timestamp}] ❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        if (error.response?.status === 404) {
          const errorData = error.response.data;
          let errorMessage = 'Instance not found';
          
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
          }
          
          const fullError = `Instance "${name}" not found in Evolution API. Please create the instance first using POST /api/instances or GET /api/instances/qr. Error: ${errorMessage}`;
          console.error(`[${timestamp}] ❌ ${fullError}`);
          throw new Error(fullError);
        }
        
        if (error.response?.status === 401 || error.response?.status === 403) {
          const errorMsg = `Authentication failed. Check your AUTHENTICATION_API_KEY. Status: ${error.response.status}`;
          console.error(`[${timestamp}] ❌ ${errorMsg}`);
          throw new Error(errorMsg);
        }
        
        // Generic error with details
        const errorData = error.response?.data;
        let errorMessage = error.message || 'Unknown error';
        
        if (errorData) {
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
          }
        }
        
        const fullError = `Evolution API returned ${error.response?.status}: ${errorMessage}`;
        console.error(`[${timestamp}] ❌ ${fullError}`);
        throw new Error(fullError);
      }
      
      console.error(`[${timestamp}] ❌ Error:`, error.message);
      throw error;
    }
  }

  async getWebhook(instanceName?: string): Promise<any> {
    const name = instanceName || this.instanceName;
    
    try {
      const response = await axios.get(
        `${this.baseUrl}/webhook/find/${name}`,
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return null; // Webhook not configured
        }
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
        }
      }
      throw error;
    }
  }
}

export const webhookConfigService = new WebhookConfigService();
