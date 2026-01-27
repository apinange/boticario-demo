import { WhatsAppMessage } from '../types/message.types';

export function filterGroupMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return messages.filter((msg) => {
    const remoteJid = msg.key?.remoteJid || '';
    return !remoteJid.includes('@g.us');
  });
}

export function filterSelfMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return messages.filter((msg) => !msg.key?.fromMe);
}

export function filterValidMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  return messages.filter((msg) => {
    const remoteJid = msg.key?.remoteJid || '';
    const phoneNumber = remoteJid.split('@')[0] || '';
    return /^\d{10,15}$/.test(phoneNumber);
  });
}
