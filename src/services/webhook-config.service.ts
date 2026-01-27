import axios from 'axios';
import { config } from '../config/env.config';

export class WebhookConfigService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanceName: string;

  constructor() {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instanceName = config.instanceName;
  }

  async setupWebhook(webhookUrl: string, instanceName?: string): Promise<any> {
    const name = instanceName || this.instanceName;
    
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
              'QRCODE_UPDATE'
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
        return response.data;
      }
      
      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
        }
      }
      throw error;
    }
  }
}

export const webhookConfigService = new WebhookConfigService();
