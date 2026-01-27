import axios from 'axios';
import { config } from '../config/env.config';

export class InstanceService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly instanceName: string;

  constructor() {
    this.baseUrl = config.evolutionApiUrl;
    this.apiKey = config.evolutionApiKey;
    this.instanceName = config.instanceName;
  }

  async fetchInstances(): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/instance/fetchInstances`,
        {
          headers: {
            apikey: this.apiKey
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        return Array.isArray(response.data) ? response.data : [];
      }
      
      return [];
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
      }
      throw error;
    }
  }

  async createInstance(instanceName?: string): Promise<any> {
    const name = instanceName || this.instanceName;
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/instance/create`,
        {
          instanceName: name,
          token: name,
          integration: 'WHATSAPP-BAILEYS'
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
        return response.data;
      }
      
      throw new Error(`Unexpected status: ${response.status}`);
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 409) {
          throw new Error(`Instance "${name}" already exists`);
        }
        if (error.response?.status === 400) {
          const errorMessage = error.response?.data?.response?.message || 
                              error.response?.data?.message || 
                              JSON.stringify(error.response?.data) ||
                              error.message;
          console.error(`[${new Date().toISOString()}] ❌ Error creating instance (400):`, {
            status: error.response.status,
            data: error.response.data,
            message: errorMessage
          });
          throw new Error(`Bad request: ${errorMessage}`);
        }
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
        }
        // Log full error for debugging
        console.error(`[${new Date().toISOString()}] ❌ Error creating instance:`, {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        });
      }
      throw error;
    }
  }

  async getQrCode(instanceName?: string): Promise<{ qrCode: string; base64: string } | null> {
    const name = instanceName || this.instanceName;
    
    try {
      // First, try to disconnect if already connected
      try {
        await axios.delete(
          `${this.baseUrl}/instance/logout/${name}`,
          {
            headers: {
              apikey: this.apiKey
            },
            timeout: 10000
          }
        );
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        // Ignore errors - instance might not be connected
      }

      // Now connect to get QR code
      const response = await axios.get(
        `${this.baseUrl}/instance/connect/${name}?qrcode=true`,
        {
          headers: {
            apikey: this.apiKey
          },
          timeout: 30000
        }
      );

      if (response.status === 200) {
        const data = response.data;
        
        // Extract QR code from response
        let qrCode: string | null = null;
        
        if (data.base64) {
          const base64Str = typeof data.base64 === 'string' ? data.base64 : data.base64.toString();
          qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
        } else if (data.code) {
          qrCode = typeof data.code === 'string' ? data.code : data.code.toString();
        } else if (data.qrcode) {
          if (typeof data.qrcode === 'string') {
            qrCode = data.qrcode;
          } else if (data.qrcode.base64) {
            const base64Str = typeof data.qrcode.base64 === 'string' ? data.qrcode.base64 : data.qrcode.base64.toString();
            qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
          } else if (data.qrcode.code) {
            qrCode = data.qrcode.code;
          }
        }

        if (qrCode) {
          return {
            qrCode: qrCode,
            base64: `data:image/png;base64,${qrCode}`
          };
        }
      }
      
      return null;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
        }
      }
      throw error;
    }
  }

  async reconnectInstance(instanceName?: string): Promise<{ qrCode: string; base64: string } | null> {
    const name = instanceName || this.instanceName;
    
    try {
      // First, try to logout/disconnect
      try {
        await axios.delete(
          `${this.baseUrl}/instance/logout/${name}`,
          {
            headers: {
              apikey: this.apiKey
            },
            timeout: 10000
          }
        );
      } catch (error: any) {
        // Ignore errors
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Now connect again to get a fresh QR code
      const response = await axios.get(
        `${this.baseUrl}/instance/connect/${name}?qrcode=true`,
        {
          headers: {
            apikey: this.apiKey
          },
          timeout: 30000
        }
      );

      if (response.status === 200) {
        const data = response.data;
        
        let qrCode: string | null = null;
        
        if (data.base64) {
          const base64Str = typeof data.base64 === 'string' ? data.base64 : data.base64.toString();
          qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
        } else if (data.qrcode?.base64) {
          const base64Str = typeof data.qrcode.base64 === 'string' ? data.qrcode.base64 : data.qrcode.base64.toString();
          qrCode = base64Str.replace(/^data:image\/png;base64,/, '');
        }

        if (qrCode) {
          return {
            qrCode: qrCode,
            base64: `data:image/png;base64,${qrCode}`
          };
        }
      }
      
      return null;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error(`Cannot connect to Evolution API at ${this.baseUrl}`);
        }
      }
      throw error;
    }
  }

  async deleteInstance(instanceName: string): Promise<void> {
    try {
      await axios.delete(
        `${this.baseUrl}/instance/delete/${instanceName}`,
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          data: {
            instanceName: instanceName
          },
          timeout: 10000
        }
      );
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // Instance not found is OK, just return
          return;
        }
        if (error.response?.status === 400) {
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
          throw new Error(`Evolution API returned 400: ${errorMessage}`);
        }
      }
      throw error;
    }
  }

  async deleteAllInstances(): Promise<void> {
    try {
      const instances = await this.fetchInstances();
      
      // Delete all instances
      const deletePromises = instances.map(async (inst: any) => {
        const instanceName = inst.instance?.instanceName || inst.instanceName;
        if (instanceName) {
          try {
            await this.deleteInstance(instanceName);
            console.log(`[${new Date().toISOString()}] ✅ Deleted instance: ${instanceName}`);
          } catch (error: any) {
            console.warn(`[${new Date().toISOString()}] ⚠️  Failed to delete instance ${instanceName}:`, error.message);
          }
        }
      });
      
      await Promise.all(deletePromises);
    } catch (error: any) {
      console.error(`[${new Date().toISOString()}] ❌ Error deleting all instances:`, error.message);
      throw error;
    }
  }

  async logoutInstance(instanceName?: string): Promise<void> {
    const name = instanceName || this.instanceName;
    
    try {
      await axios.delete(
        `${this.baseUrl}/instance/logout/${name}`,
        {
          headers: {
            apikey: this.apiKey,
            'Content-Type': 'application/json'
          },
          data: {
            instanceName: name
          },
          timeout: 10000
        }
      );
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          // Instance not found is OK, just log it
          return;
        }
        if (error.response?.status === 400) {
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
          throw new Error(`Evolution API returned 400: ${errorMessage}`);
        }
      }
      throw error;
    }
  }
}

export const instanceService = new InstanceService();
