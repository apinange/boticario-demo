# Deploy Rápido no Render - Checklist

Guia rápido para deploy do projeto no Render.

## ✅ Checklist de Deploy

### 1. Preparar Repositório
```bash
git add .
git commit -m "Prepare for Render deployment"
git push
```

### 2. Criar PostgreSQL (OBRIGATÓRIO - Primeiro Passo!)

⚠️ **CRIE O POSTGRESQL ANTES DO BLUEPRINT**

1. Render Dashboard → **"New"** → **"PostgreSQL"**
2. Nome: `whatsapp-postgres`
3. Database: `evolution`
4. Plan: **Free**
5. **Create Database**
6. **Copie a `DATABASE_URL`**

### 3. Deploy via Blueprint

1. Render Dashboard → **"New"** → **"Blueprint"**
2. Conecte repositório: `https://github.com/apinange/boticario-demo.git`
3. Render detecta `render.yaml` automaticamente
4. Clique em **"Apply"**

### 4. Configurar Variáveis de Ambiente

#### Evolution API (`evolution-api`)

**Conectar automaticamente:**
- `DATABASE_URL` → PostgreSQL (`whatsapp-postgres`)
- `REDIS_URL` → Redis (`whatsapp-redis`)

**Adicionar manualmente:**
```
NODE_ENV=production
AUTHENTICATION_API_KEY=<sua_chave>
SERVER_URL=https://evolution-api.onrender.com
```
*(Atualize `SERVER_URL` com a URL real após o deploy)*

#### WhatsApp Integration (`whatsapp-integration`)

**Conectar automaticamente:**
- `REDIS_URL` → Redis (`whatsapp-redis`)

**Adicionar manualmente:**
```
NODE_ENV=production
WEBHOOK_PORT=3000

# Evolution API
SERVER_URL=https://evolution-api.onrender.com
EVOLUTION_API_URL=https://evolution-api.onrender.com
AUTHENTICATION_API_KEY=<mesma_chave>
INSTANCE_NAME=default

# WhatsApp
DEFAULT_PHONE_NUMBER=<número_do_usuário>

# OCP
OCP_WS_URL=wss://seu-endpoint-ocp.com
OCP_API_KEY=<sua_chave_ocp>

# Opcional
OPENAI_API_KEY=<sua_chave_openai>
LOGGING_ENDPOINT_URL=<url_do_logging>
```

### 5. URLs Após Deploy

- **WhatsApp Integration**: `https://whatsapp-integration.onrender.com`
- **Evolution API**: `https://evolution-api.onrender.com`
- **Swagger Docs**: `https://whatsapp-integration.onrender.com/api-docs`

### 6. Configurar Webhook

```bash
curl -X POST https://whatsapp-integration.onrender.com/api/webhook/setup \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://whatsapp-integration.onrender.com/webhook",
    "instanceName": "default"
  }'
```

### 7. Criar Instância WhatsApp

```bash
curl -X POST https://whatsapp-integration.onrender.com/api/instances \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "default"}'
```

### 8. Obter QR Code

```bash
curl https://whatsapp-integration.onrender.com/api/instances/qr?instanceName=default
```

Use o campo `base64` da resposta para exibir o QR code.

### 9. Escanear QR Code

1. WhatsApp → Configurações → Aparelhos conectados
2. "Conectar um aparelho"
3. Escanear QR code

### 10. Manter Serviços Ativos (UptimeRobot)

1. Crie conta em [uptimerobot.com](https://uptimerobot.com)
2. Adicione monitors:
   - `https://whatsapp-integration.onrender.com/health` (5 min)
   - `https://evolution-api.onrender.com` (5 min)

## 🎯 Testar API

Acesse a documentação Swagger:

**`https://whatsapp-integration.onrender.com/api-docs`**

Teste os endpoints diretamente no Swagger UI!

## 📋 Endpoints Principais

- `GET /health` - Health check
- `GET /status` - Status do sistema
- `GET /api/instances` - Listar instâncias
- `POST /api/instances` - Criar instância
- `GET /api/instances/qr` - Obter QR code
- `POST /api/messages` - Enviar mensagem
- `POST /api/bot-mode` - Configurar modo bot
- `POST /api/agent-mode/enable` - Ativar modo agente

Veja [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) para lista completa.

## ⚠️ Lembrete

- Serviços free "dormem" após 15 min → Configure UptimeRobot
- PostgreSQL deve ser criado ANTES do Blueprint
- Configure todas as variáveis de ambiente após o deploy
- Atualize `SERVER_URL` e `EVOLUTION_API_URL` com as URLs reais
