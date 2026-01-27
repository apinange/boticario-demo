export class EscalationService {
  private readonly escalationPhrase = 'Olá, eu acabei de pagar meu boleto via Pix para liberar meu limite, mas o sistema ainda não atualizou e eu não consigo fechar meu pedido da Beauty Week. Podem verificar?';

  shouldEscalateToAgent(userMessage: string): boolean {
    const normalize = (text: string): string => {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    };
    
    const normalizedUserMessage = normalize(userMessage);
    const normalizedEscalationPhrase = normalize(this.escalationPhrase);
    
    return normalizedUserMessage === normalizedEscalationPhrase;
  }
}

export const escalationService = new EscalationService();
