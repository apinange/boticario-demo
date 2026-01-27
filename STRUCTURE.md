# Estrutura do Projeto

## Organização de Arquivos

```
src/
├── core/                    # Arquivos principais do sistema
│   ├── webhook-server.ts   # Servidor Express que recebe webhooks
│   ├── ocp-websocket.ts    # Cliente WebSocket para OCP
│   └── message-logger.ts   # Sistema de logging de mensagens
│
├── commands/               # Comandos CLI para gerenciamento
│   ├── check-instance.ts   # Verificar status da instância
│   ├── create-instance.ts  # Criar nova instância
│   ├── get-qr.ts          # Obter QR code para conectar WhatsApp
│   ├── reconnect.ts        # Reconectar instância
│   ├── send-message.ts    # Enviar mensagem de teste
│   ├── send-ocp-message.ts # Enviar mensagem iniciada pelo OCP
│   └── setup-webhook.ts   # Configurar webhook na Evolution API
│
├── features/              # Features e funcionalidades
│   ├── agent-mode.ts      # Gerenciamento de modo agente
│   ├── set-agent-mode.ts  # CLI para configurar modo agente
│   ├── bot-mode.ts        # Gerenciamento de modo bot (proativo/reativo)
│   ├── set-bot-mode.ts    # CLI para configurar modo bot
│   ├── restart-ocp-session.ts # Reiniciar sessão OCP
│   └── start-conversation.ts  # Iniciar conversa manualmente
│
└── utils/                 # Utilitários e ferramentas
    ├── bot-message-tracker.ts # Rastreamento de mensagens do bot
    ├── expose-tunnel.ts   # Expor servidor via túnel público
    ├── get-tunnel-url.ts  # Obter URL do túnel
    ├── stop-tunnel.ts     # Parar túnel
    └── test-tunnel.ts     # Testar conectividade do túnel
```

## Descrição das Pastas

### `core/`
Arquivos principais que fazem o sistema funcionar:
- **webhook-server.ts**: Servidor Express que recebe webhooks da Evolution API e roteia mensagens
- **ocp-websocket.ts**: Cliente WebSocket que mantém conexão com OCP e gerencia sessões
- **message-logger.ts**: Sistema de logging que envia mensagens para endpoint externo via multipart

### `commands/`
Comandos CLI para gerenciar a instância WhatsApp:
- Comandos para criar, verificar, conectar instâncias
- Enviar mensagens de teste
- Configurar webhooks

### `features/`
Funcionalidades específicas do sistema:
- **Modo Bot**: Controla se o bot é proativo ou reativo
- **Modo Agente**: Gerencia quando escalar para agente humano
- **Sessão OCP**: Comandos para reiniciar e gerenciar sessões

### `utils/`
Utilitários e ferramentas auxiliares:
- Rastreamento de mensagens do bot
- Túnel público para expor servidor local
- Testes de conectividade

## Scripts NPM

Todos os scripts estão configurados no `package.json` e funcionam com a nova estrutura:

```bash
# Core
npm run webhook              # Iniciar servidor webhook

# Commands
npm run create              # Criar instância
npm run check               # Verificar instância
npm run qr                  # Obter QR code
npm run send                # Enviar mensagem de teste

# Features
npm run bot-mode            # Configurar modo bot
npm run agent-mode          # Configurar modo agente
npm run start-conversation  # Iniciar conversa manualmente

# Utils
npm run expose              # Expor servidor via túnel
npm run stop-tunnel         # Parar túnel
npm run test-tunnel         # Testar túnel
```

