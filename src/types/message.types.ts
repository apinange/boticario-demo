export interface WhatsAppMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    imageMessage?: {
      caption?: string;
      mimetype?: string;
    };
    videoMessage?: {
      caption?: string;
      mimetype?: string;
    };
    documentMessage?: {
      caption?: string;
      mimetype?: string;
    };
    audioMessage?: {
      id?: string;
      mimetype?: string;
    };
  };
  messageTimestamp?: number;
}

export interface WebhookEvent {
  event: string;
  instance: string;
  data: WhatsAppMessage | WhatsAppMessage[];
}

export interface LogMessage {
  flag: 'USER' | 'BOT';
  phoneNumber: string;
  text: string;
  message?: WhatsAppMessage;
  messageId?: string;
}
