# Estrutura do Projeto

## Organização Modular

O projeto foi reorganizado em uma estrutura modular seguindo padrões de arquitetura limpa:

```
src/
├── config/                    # Configurações
│   ├── env.config.ts         # Variáveis de ambiente
│   └── cors.config.ts        # Configuração CORS
│
├── core/                      # Arquivos principais do sistema
│   ├── app.ts                # Aplicação Express principal
│   ├── webhook-server.ts     # Entry point do servidor
│   ├── ocp-websocket.ts      # Cliente WebSocket para OCP
│   └── message-logger.ts     # Sistema de logging de mensagens
│
├── services/                  # Serviços de negócio
│   ├── evolution-api.service.ts      # Comunicação com Evolution API
│   ├── message-processor.service.ts  # Processamento de mensagens
│   ├── audio-transcription.service.ts # Transcrição de áudio
│   ├── escalation.service.ts          # Lógica de escalação
│   └── catalog.service.ts             # Envio de catálogo
│
├── controllers/              # Controllers (handlers de requisições)
│   ├── webhook.controller.ts # Handler de webhooks
│   ├── agent.controller.ts   # Handler de mensagens do agente
│   ├── health.controller.ts  # Health check
│   └── status.controller.ts  # Status do sistema
│
├── routes/                    # Definição de rotas
│   └── index.routes.ts       # Rotas principais
│
├── middleware/                # Middleware
│   ├── phone-validation.middleware.ts # Validação de números
│   └── message-filter.middleware.ts   # Filtros de mensagens
│
├── types/                     # Tipos TypeScript
│   └── message.types.ts       # Tipos de mensagens
│
├── commands/                  # Comandos CLI
│   ├── check-instance.ts
│   ├── create-instance.ts
│   ├── get-qr.ts
│   ├── reconnect.ts
│   ├── send-message.ts
│   ├── send-ocp-message.ts
│   └── setup-webhook.ts
│
├── features/                  # Features e funcionalidades
│   ├── agent-mode.ts
│   ├── set-agent-mode.ts
│   ├── bot-mode.ts
│   ├── set-bot-mode.ts
│   ├── restart-ocp-session.ts
│   └── start-conversation.ts
│
└── utils/                     # Utilitários
    └── bot-message-tracker.ts
```

## Descrição das Pastas

### `config/`
Configurações centralizadas:
- **env.config.ts**: Todas as variáveis de ambiente em um único lugar
- **cors.config.ts**: Configuração de CORS reutilizável

### `core/`
Arquivos principais que fazem o sistema funcionar:
- **app.ts**: Configuração da aplicação Express
- **webhook-server.ts**: Entry point que inicia o servidor
- **ocp-websocket.ts**: Cliente WebSocket que mantém conexão com OCP
- **message-logger.ts**: Sistema de logging que envia mensagens para endpoint externo

### `services/`
Serviços de negócio (lógica de negócio isolada):
- **evolution-api.service.ts**: Comunicação com Evolution API (envio de mensagens, mídia)
- **message-processor.service.ts**: Processamento completo de mensagens (áudio, mídia, texto)
- **audio-transcription.service.ts**: Transcrição de áudio usando OpenAI
- **escalation.service.ts**: Lógica de detecção de escalação
- **catalog.service.ts**: Envio de catálogo de produtos

### `controllers/`
Controllers que lidam com requisições HTTP:
- **webhook.controller.ts**: Recebe e processa webhooks da Evolution API
- **agent.controller.ts**: Endpoint para agentes enviarem mensagens
- **health.controller.ts**: Health check endpoint
- **status.controller.ts**: Status do sistema e conexão OCP

### `routes/`
Definição de rotas:
- **index.routes.ts**: Todas as rotas da aplicação

### `middleware/`
Middleware reutilizável:
- **phone-validation.middleware.ts**: Validação e normalização de números
- **message-filter.middleware.ts**: Filtros para mensagens (grupos, próprias, válidas)

### `types/`
Tipos TypeScript compartilhados:
- **message.types.ts**: Tipos para mensagens WhatsApp e eventos

### `commands/`
Comandos CLI para gerenciar a instância WhatsApp

### `features/`
Funcionalidades específicas do sistema:
- **Modo Bot**: Controla se o bot é proativo ou reativo
- **Modo Agente**: Gerencia quando escalar para agente humano
- **Sessão OCP**: Comandos para reiniciar e gerenciar sessões

### `utils/`
Utilitários e ferramentas auxiliares:
- Rastreamento de mensagens do bot

## Arquitetura

### Fluxo de uma Mensagem

1. **Webhook recebido** → `webhook.controller.ts`
2. **Processamento** → `message-processor.service.ts`
3. **Validação** → `phone-validation.middleware.ts`
4. **Filtros** → `message-filter.middleware.ts`
5. **Processamento específico**:
   - Áudio → `audio-transcription.service.ts`
   - Mídia → Extração de caption ou contagem de imagens
   - Texto → Verificação de escalação → Envio para OCP
6. **Logging** → `message-logger.ts`
7. **Envio para OCP** → `ocp-websocket.ts`
8. **Resposta do OCP** → `evolution-api.service.ts` → WhatsApp

## Scripts NPM

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
```

## Benefícios da Estrutura Modular

1. **Separação de Responsabilidades**: Cada módulo tem uma responsabilidade clara
2. **Reutilização**: Serviços podem ser reutilizados em diferentes contextos
3. **Testabilidade**: Fácil de testar cada módulo isoladamente
4. **Manutenibilidade**: Código organizado e fácil de encontrar
5. **Escalabilidade**: Fácil adicionar novos recursos sem afetar código existente