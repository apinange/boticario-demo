# WhatsApp Integrations - Boticário Demo

Sistema de integração WhatsApp usando Evolution API e OCP (Omilia Chat Platform).

## 🚀 Funcionalidades

- **Integração com Evolution API**: Envio e recebimento de mensagens WhatsApp
- **OCP WebSocket**: Integração com Omilia Chat Platform para chatbot inteligente
- **Sistema de Logging**: Log de todas as mensagens (usuário e bot) com suporte a mídia
- **Modo Proativo/Reativo**: Controle em tempo real se o bot inicia conversas ou espera
- **Escalação para Agente**: Mecanismo para transferir conversas para agentes humanos
- **Restrição de Número**: Aceita mensagens apenas do número configurado
- **Tunnel Público**: Exposição pública do servidor para demos

## 📋 Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- Conta OCP com API Key
- Evolution API configurada

## 🛠️ Instalação

1. Clone o repositório:
```bash
git clone https://github.com/apinange/boticario-demo.git
cd boticario-demo
```

2. Instale as dependências:
```bash
npm install
cd evolution-api && npm install && cd ..
```

3. Configure as variáveis de ambiente:
```bash
cp .env.example .env
# Edite o .env com suas configurações
```

4. Inicie os serviços:
```bash
./start.sh
```

## 📝 Variáveis de Ambiente

Principais variáveis no `.env`:

```env
# Evolution API
SERVER_URL=http://localhost:8080
AUTHENTICATION_API_KEY=sua_chave
INSTANCE_NAME=default

# WhatsApp
DEFAULT_PHONE_NUMBER=18259622852

# OCP
OCP_API_KEY=sua_chave_ocp

# OpenAI (opcional - para transcrição de áudio)
OPENAI_API_KEY=sua_chave_openai

# Logging
LOGGING_ENDPOINT_URL=http://localhost:8000/

# Webhook
WEBHOOK_PORT=3000
```

## 🎮 Comandos Disponíveis

```bash
# Iniciar tudo (PostgreSQL, Redis, Evolution API, Webhook)
./start.sh

# Parar tudo
./stop.sh

# Verificar status da instância
npm run check

# Obter QR Code
npm run qr

# Reconectar instância
npm run reconnect

# Configurar webhook
npm run setup-webhook

# Modo do bot (proativo/reativo)
npm run bot-mode

# Modo agente
npm run agent-mode

# Reiniciar sessão OCP
npm run restart-ocp

# Iniciar conversa (modo proativo)
npm run start-conversation

# Expor tunnel público
npm run expose

# Parar tunnel
npm run stop-tunnel
```

## 🌐 Deploy no Render

Veja o guia completo em [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) ou o guia rápido em [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md).

## 📚 Estrutura do Projeto

```
whatsapp_integrations/
├── src/
│   ├── core/           # Servidores principais
│   │   ├── webhook-server.ts
│   │   ├── ocp-websocket.ts
│   │   └── message-logger.ts
│   ├── commands/       # Comandos CLI
│   ├── features/       # Funcionalidades
│   └── utils/          # Utilitários
├── evolution-api/      # Evolution API
├── render.yaml         # Configuração Render
└── docker-compose.yml  # Serviços Docker
```

## 🔗 Endpoints

- **Webhook**: `POST /webhook` - Recebe eventos da Evolution API
- **Health**: `GET /health` - Health check
- **Status**: `GET /status` - Status do sistema
- **Agent Message**: `POST /agent/message` - Envia mensagem do agente

## 📖 Documentação

- [RENDER_DEPLOY.md](./RENDER_DEPLOY.md) - Guia de deploy no Render
- [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md) - Checklist rápido de deploy
- [STRUCTURE.md](./STRUCTURE.md) - Estrutura detalhada do projeto

## 📄 Licença

ISC
