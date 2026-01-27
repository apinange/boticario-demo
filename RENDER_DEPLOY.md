# Deploy no Render

Este guia explica como fazer deploy do projeto WhatsApp Integrations no Render.

## Estrutura de Serviços

O projeto será deployado com os seguintes serviços:

1. **Webhook Server** - Servidor principal que recebe webhooks e gerencia OCP
2. **Evolution API** - API do WhatsApp
3. **PostgreSQL** - Banco de dados (gerenciado pelo Render)
4. **Redis** - Cache (gerenciado pelo Render)

## Passo a Passo

### 1. Preparar o Repositório

Certifique-se de que todos os arquivos estão commitados no Git:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push
```

### 2. Criar Conta no Render

1. Acesse [render.com](https://render.com)
2. Crie uma conta (pode usar GitHub para login)
3. Conecte seu repositório

### 3. Criar Serviços no Render

#### Opção A: Deploy Automático via render.yaml (Recomendado)

1. No dashboard do Render, clique em "New" > "Blueprint"
2. Conecte seu repositório
3. Render detectará automaticamente o `render.yaml`
4. Revise as configurações e clique em "Apply"

#### Opção B: Criar Serviços Manualmente

##### 3.1. PostgreSQL

1. "New" > "PostgreSQL"
2. Nome: `whatsapp-postgres`
3. Plano: Free
4. Database: `evolution`
5. Clique em "Create Database"

##### 3.2. Redis

1. "New" > "Redis"
2. Nome: `whatsapp-redis`
3. Plano: Free
4. Clique em "Create Redis"

##### 3.3. Evolution API

1. "New" > "Web Service"
2. Conecte seu repositório
3. Configurações:
   - **Name**: `evolution-api`
   - **Root Directory**: `evolution-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Plan**: Free

4. **Environment Variables**:
   - Clique em "Add Environment Variable" > "Add from..." para:
     - `DATABASE_URL` (selecione o serviço PostgreSQL)
     - `REDIS_URL` (selecione o serviço Redis)
   - Adicione manualmente:
     ```
     NODE_ENV=production
     AUTHENTICATION_API_KEY=<sua chave>
     SERVER_URL=https://evolution-api.onrender.com
     ```
   - **Nota**: A URL `SERVER_URL` será a URL do próprio serviço Evolution API (você verá após o deploy)

##### 3.4. Webhook Server

1. "New" > "Web Service"
2. Conecte seu repositório
3. Configurações:
   - **Name**: `whatsapp-webhook-server`
   - **Root Directory**: `.` (raiz)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run webhook`
   - **Plan**: Free

4. **Environment Variables**:
   - Clique em "Add Environment Variable" > "Add from..." para:
     - `DATABASE_URL` (selecione o serviço PostgreSQL)
     - `REDIS_URL` (selecione o serviço Redis)
   - Adicione manualmente:
     ```
     NODE_ENV=production
     WEBHOOK_PORT=3000
     SERVER_URL=https://evolution-api.onrender.com
     EVOLUTION_API_URL=https://evolution-api.onrender.com
     AUTHENTICATION_API_KEY=<sua chave>
     INSTANCE_NAME=default
     DEFAULT_PHONE_NUMBER=<número do usuário>
     OCP_API_KEY=<sua chave OCP>
     OPENAI_API_KEY=<sua chave OpenAI - opcional>
     LOGGING_ENDPOINT_URL=<URL do endpoint de logging>
     ```
   - **Importante**: Configure `SERVER_URL` e `EVOLUTION_API_URL` com a URL do serviço Evolution API após o deploy

### 4. Configurar Variáveis de Ambiente

Para cada serviço, adicione as variáveis de ambiente necessárias:

**Importante**: 
- `DATABASE_URL` e `REDIS_URL` podem ser conectados automaticamente usando "Add Environment Variable" > "Add from..."
- Outras variáveis devem ser configuradas manualmente

### 5. URLs dos Serviços

Após o deploy, você terá URLs como:
- Webhook Server: `https://whatsapp-webhook-server.onrender.com`
- Evolution API: `https://evolution-api.onrender.com`

### 6. Configurar Webhook na Evolution API

Após o deploy, configure o webhook:

```bash
# Use a URL do webhook server
curl -X POST https://evolution-api.onrender.com/webhook/set/default \
  -H "apikey: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://whatsapp-webhook-server.onrender.com/webhook",
    "webhook_by_events": false,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATE"
    ]
  }'
```

## Importante: Serviços Free "Dormem"

⚠️ **Atenção**: No plano free do Render, serviços web "dormem" após 15 minutos de inatividade.

**Soluções**:

1. **UptimeRobot (Recomendado - Grátis)**:
   - Crie conta em [uptimerobot.com](https://uptimerobot.com)
   - Adicione monitor para:
     - `https://whatsapp-webhook-server.onrender.com/health` (ping a cada 5 minutos)
     - `https://evolution-api.onrender.com` (ping a cada 5 minutos)
   - Isso mantém os serviços ativos

2. **Upgrade para Plano Pago**:
   - $7/mês por serviço web
   - Serviços nunca "dormem"
   - Melhor para produção

3. **Cron Job Interno** (alternativa):
   - Configure um cron job no Render que faz requisições periódicas
   - Menos confiável que UptimeRobot

## Troubleshooting

### Serviço não inicia
- Verifique os logs no dashboard do Render
- Confirme que todas as variáveis de ambiente estão configuradas
- Verifique se o `DATABASE_URL` e `REDIS_URL` estão conectados corretamente

### WebSocket não funciona
- Render free pode ter limitações com WebSockets
- Considere fazer upgrade para plano pago
- Ou use um serviço alternativo para WebSockets (ex: Pusher, Ably)

### Evolution API não conecta
- Verifique se a URL está correta
- Confirme que o serviço Evolution API está rodando
- Verifique os logs do Evolution API

## Próximos Passos

Após o deploy:
1. Configure o webhook na Evolution API
2. Crie a instância do WhatsApp
3. Escaneie o QR code
4. Teste o sistema
