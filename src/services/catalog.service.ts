import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { evolutionApiService } from './evolution-api.service';

export class CatalogService {
  private readonly catalogImagePath: string;
  private readonly catalogImageUrl = 'https://minhaloja-resources.grupoboticario.com.br/magazine/1555/page_1.jpg';

  constructor() {
    this.catalogImagePath = path.join(process.cwd(), 'imgs', 'catalog.png');
  }

  private async getImageBase64(): Promise<string | null> {
    const timestamp = new Date().toISOString();
    
    // Try to download from URL first
    try {
      console.log(`[${timestamp}] 📥 Baixando catálogo da URL: ${this.catalogImageUrl}`);
      const response = await axios.get(this.catalogImageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      
      const imageBuffer = Buffer.from(response.data);
      const imageBase64 = imageBuffer.toString('base64');
      console.log(`[${timestamp}] ✅ Catálogo baixado (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
      return imageBase64;
    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Erro ao baixar catálogo da URL:`, error.message);
      console.log(`[${timestamp}] 🔄 Tentando arquivo local...`);
    }
    
    // Fallback to local file
    if (fs.existsSync(this.catalogImagePath)) {
      console.log(`[${timestamp}] 📖 Lendo catálogo do arquivo local: ${this.catalogImagePath}`);
      const imageBuffer = fs.readFileSync(this.catalogImagePath);
      return imageBuffer.toString('base64');
    }
    
    return null;
  }

  async sendCatalog(phoneNumber: string, caption: string = ''): Promise<boolean> {
    const timestamp = new Date().toISOString();
    
    try {
      const imageBase64 = await this.getImageBase64();
      
      if (!imageBase64) {
        console.error(`[${timestamp}] ❌ Não foi possível obter a imagem do catálogo`);
        return false;
      }
      
      // Format phone number
      let formattedNumber = phoneNumber;
      if (formattedNumber.length === 11 && !formattedNumber.startsWith('1') && !formattedNumber.startsWith('55')) {
        formattedNumber = `1${formattedNumber}`;
      } else if (formattedNumber.length === 10) {
        formattedNumber = `1${formattedNumber}`;
      }
      
      console.log(`[${timestamp}] 📤 Enviando catálogo para WhatsApp`);
      console.log(`[${timestamp}]    Phone: ${formattedNumber}`);
      console.log(`[${timestamp}]    Caption: ${caption}`);
      
      // Send image via Evolution API
      const messageId = await evolutionApiService.sendMedia(
        formattedNumber,
        'image',
        imageBase64,
        'catalog.jpg',
        caption
      );
      
      if (messageId) {
        console.log(`[${timestamp}] ✅ Catálogo enviado com sucesso!`);
        console.log(`[${timestamp}]    Message ID: ${messageId}`);
        return true;
      }
      
      return false;
    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error(`[${errorTimestamp}] ❌ Erro ao enviar catálogo:`, error.message);
      return false;
    }
  }
}

export const catalogService = new CatalogService();
