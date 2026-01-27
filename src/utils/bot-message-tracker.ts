/**
 * Tracks bot messages and image counts per phone number
 * Used to detect when user should send "sim" after sending 3 images
 */

interface ImageTracking {
  waitingForImages: boolean; // True when bot said the waiting phrase
  imageCount: number; // Number of images received
  timestamp: number; // When tracking started
}

class BotMessageTracker {
  private imageTracking: Map<string, ImageTracking> = new Map();
  private readonly MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

  // Exact phrase that triggers image waiting
  private readonly WAITING_PHRASE = 'Vou aguardar, você pode me mandar um de cada vez ou os 3 juntos';
  private readonly REQUIRED_IMAGE_COUNT = 3;

  /**
   * Normalize text for comparison (remove accents, lowercase, normalize whitespace)
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Record a bot message for a phone number
   * Detects if bot said the waiting phrase
   */
  public recordBotMessage(phoneNumber: string, text: string): void {
    const normalizedText = this.normalize(text);
    const normalizedPhrase = this.normalize(this.WAITING_PHRASE);

    // Check if bot said the exact waiting phrase
    if (normalizedText === normalizedPhrase) {
      console.log(`[BotMessageTracker] ✅ Frase de espera detectada para ${phoneNumber}`);
      console.log(`[BotMessageTracker]    Aguardando ${this.REQUIRED_IMAGE_COUNT} imagens do usuário`);
      
      // Start tracking images for this phone number
      this.imageTracking.set(phoneNumber, {
        waitingForImages: true,
        imageCount: 0,
      timestamp: Date.now()
    });
    }
  }

  /**
   * Record that user sent image(s)
   * Returns true if we should send "sim" to OCP (3+ images received)
   */
  public recordImage(phoneNumber: string, imageCount: number = 1): boolean {
    const tracking = this.imageTracking.get(phoneNumber);
    
    if (!tracking || !tracking.waitingForImages) {
      // Not waiting for images, ignore
      return false;
    }

    // Check if tracking is too old
    const age = Date.now() - tracking.timestamp;
    if (age > this.MAX_AGE_MS) {
      console.log(`[BotMessageTracker] ⚠️  Rastreamento muito antigo para ${phoneNumber} (${Math.round(age / 1000)}s)`);
      this.imageTracking.delete(phoneNumber);
      return false;
    }
    
    // Add images to count
    tracking.imageCount += imageCount;
    console.log(`[BotMessageTracker] 📸 Imagens recebidas para ${phoneNumber}: ${tracking.imageCount}/${this.REQUIRED_IMAGE_COUNT}`);

    // Check if we reached the required count
    if (tracking.imageCount >= this.REQUIRED_IMAGE_COUNT) {
      console.log(`[BotMessageTracker] ✅ ${this.REQUIRED_IMAGE_COUNT}+ imagens recebidas! Enviando "sim" para OCP`);
      // Clear tracking after sending
      this.imageTracking.delete(phoneNumber);
      return true;
    }
    
    return false;
  }

  /**
   * Check if we're waiting for images from this phone number
   */
  public isWaitingForImages(phoneNumber: string): boolean {
    const tracking = this.imageTracking.get(phoneNumber);
    return tracking?.waitingForImages === true;
  }

  /**
   * Get current image count for a phone number
   */
  public getImageCount(phoneNumber: string): number {
    const tracking = this.imageTracking.get(phoneNumber);
    return tracking?.imageCount || 0;
  }

  /**
   * Clear tracking for a phone number
   */
  public clear(phoneNumber: string): void {
    this.imageTracking.delete(phoneNumber);
    console.log(`[BotMessageTracker] 🧹 Rastreamento limpo para ${phoneNumber}`);
  }

  /**
   * Clear all old tracking (cleanup)
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [phoneNumber, tracking] of this.imageTracking.entries()) {
      if (now - tracking.timestamp > this.MAX_AGE_MS) {
        this.imageTracking.delete(phoneNumber);
        console.log(`[BotMessageTracker] 🧹 Rastreamento antigo removido para ${phoneNumber}`);
      }
    }
  }
}

export const botMessageTracker = new BotMessageTracker();

