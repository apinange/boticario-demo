# Deploy Rápido no Render

## Checklist Rápido

### 1. Preparar Repositório
```bash
git add .
git commit -m "Prepare for Render deployment"
git push
```

### 2. Criar PostgreSQL (OBRIGATÓRIO - Antes do Blueprint)
1. No Render, clique em "New" > "PostgreSQL"
2. Nome: `whatsapp-postgres`
3. Plano: Free
4. Database: `evolution`
5. Clique em "Create Database"
6. **Copie a `DATABASE_URL`** - você precisará dela depois

### 3. Criar Conta e Conectar Repositório
1. Acesse [render.com](https://render.com)
2. Faça login com GitHub
3. Clique em "New" > "Blueprint"
4. Conecte seu repositório
5. Render detectará o `render.yaml` automaticamente

### 4. Configurar Variáveis de Ambiente

Após o deploy inicial, configure manualmente:

#### Evolution API:
- `AUTHENTICATION_API_KEY` = sua chave
- `DATABASE_URL` = URL do PostgreSQL criado (use "Add from..." > PostgreSQL)
- `REDIS_URL` = URL do Redis (use "Add from..." > Redis)
- `SERVER_URL` = URL do próprio serviço (ex: `https://evolution-api.onrender.com`)

#### Webhook Server:
- `DATABASE_URL` = URL do PostgreSQL criado (use "Add from..." > PostgreSQL)
- `REDIS_URL` = URL do Redis (use "Add from..." > Redis)
- `AUTHENTICATION_API_KEY` = mesma chave do Evolution API
- `SERVER_URL` = URL do Evolution API
- `EVOLUTION_API_URL` = URL do Evolution API
- `DEFAULT_PHONE_NUMBER` = número do usuário (ex: `18259622852`)
- `OCP_API_KEY` = sua chave OCP
- `OPENAI_API_KEY` = sua chave OpenAI (opcional)
- `LOGGING_ENDPOINT_URL` = URL do endpoint de logging

### 5. Manter Serviços Ativos (Plano Free)

Configure UptimeRobot para pingar:
- `https://whatsapp-webhook-server.onrender.com/health` (a cada 5 min)
- `https://evolution-api.onrender.com` (a cada 5 min)

### 6. Configurar Webhook

Após tudo rodando:
```bash
curl -X POST https://evolution-api.onrender.com/webhook/set/default \
  -H "apikey: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://whatsapp-webhook-server.onrender.com/webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATE"]
  }'
```

## URLs Finais

- **Webhook Server**: `https://whatsapp-webhook-server.onrender.com`
- **Evolution API**: `https://evolution-api.onrender.com`
- **Agent Endpoint**: `https://whatsapp-webhook-server.onrender.com/agent/message`

## Próximos Passos

1. Crie a instância do WhatsApp
2. Escaneie o QR code
3. Teste o sistema
