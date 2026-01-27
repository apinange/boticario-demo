import * as fs from 'fs';
import * as path from 'path';
import { evolutionApiService } from './evolution-api.service';

export class CatalogService {
  private readonly catalogImagePath: string;

  constructor() {
    this.catalogImagePath = path.join(process.cwd(), 'imgs', 'catalog.png');
  }

  async sendCatalog(phoneNumber: string, caption: string = ''): Promise<boolean> {
    const timestamp = new Date().toISOString();
    
    try {
      // Check if image exists
      if (!fs.existsSync(this.catalogImagePath)) {
        console.error(`[${timestamp}] ❌ Imagem não encontrada: ${this.catalogImagePath}`);
        return false;
      }
      
      // Read image file and convert to base64
      console.log(`[${timestamp}] 📖 Lendo imagem do catálogo: ${this.catalogImagePath}`);
      const imageBuffer = fs.readFileSync(this.catalogImagePath);
      const imageBase64 = imageBuffer.toString('base64');
      
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
      console.log(`[${timestamp}]    Image size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
      
      // Send image via Evolution API
      const messageId = await evolutionApiService.sendMedia(
        formattedNumber,
        'image',
        imageBase64,
        'catalog.png',
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
