# Deploy no Render - Guia Completo

Este guia explica passo a passo como fazer deploy do projeto WhatsApp Integrations no Render.

## 📋 Visão Geral

O projeto será deployado com os seguintes serviços:

1. **WhatsApp Integration** - Servidor principal com API REST e integração OCP
2. **Evolution API** - API do WhatsApp (serviço separado)
3. **PostgreSQL** - Banco de dados (criado manualmente)
4. **Redis** - Cache (gerenciado pelo Render)

## 🚀 Passo a Passo Completo

### 1. Preparar o Repositório

Certifique-se de que todos os arquivos estão commitados:

```bash
git add .
git commit -m "Prepare for Render deployment"
git push
```

### 2. Criar Conta no Render

1. Acesse [render.com](https://render.com)
2. Crie uma conta (pode usar GitHub para login)
3. Conecte seu repositório GitHub

### 3. Criar PostgreSQL (OBRIGATÓRIO - Antes do Blueprint)

⚠️ **IMPORTANTE**: O PostgreSQL não pode ser criado via Blueprint. Crie-o manualmente primeiro!

1. No dashboard do Render, clique em **"New"** > **"PostgreSQL"**
2. Configure:
   - **Name**: `whatsapp-postgres`
   - **Database**: `evolution`
   - **User**: `evolution_user` (ou deixe o padrão)
   - **Plan**: Free
3. Clique em **"Create Database"**
4. **Copie a `DATABASE_URL`** - você precisará dela depois

### 4. Deploy via Blueprint (Recomendado)

1. No dashboard do Render, clique em **"New"** > **"Blueprint"**
2. Conecte seu repositório: `https://github.com/apinange/boticario-demo.git`
3. Render detectará automaticamente o `render.yaml`
4. Revise as configurações:
   - **WhatsApp Integration** (serviço principal)
   - **Evolution API** (serviço do WhatsApp)
   - **Redis** (cache)
5. Clique em **"Apply"** para criar os serviços

### 5. Configurar Variáveis de Ambiente

Após o deploy inicial, configure as variáveis de ambiente em cada serviço:

#### 5.1. Evolution API

No serviço `evolution-api`, adicione:

1. **Conectar automaticamente** (use "Add from..."):
   - `DATABASE_URL` → Selecione o serviço PostgreSQL criado (use a **Internal URL**)
   - `REDIS_URL` → Selecione o serviço Redis

2. **Adicionar manualmente**:
   ```
   NODE_ENV=production
   AUTHENTICATION_API_KEY=<sua_chave_secreta>
   SERVER_URL=https://evolution-api.onrender.com
   DATABASE_CONNECTION_URI=<mesmo_valor_de_DATABASE_URL>
   ```
   - **Nota**: A URL `SERVER_URL` será a URL do próprio serviço Evolution API (você verá após o deploy, algo como `https://evolution-api.onrender.com`)
   - **Importante**: `DATABASE_CONNECTION_URI` deve ter o mesmo valor de `DATABASE_URL` (use a **Internal URL** do PostgreSQL)

#### 5.2. WhatsApp Integration (Serviço Principal)

No serviço `whatsapp-integration`, adicione:

1. **Conectar automaticamente** (use "Add from..."):
   - `REDIS_URL` → Selecione o serviço Redis

2. **Adicionar manualmente**:
   ```
   NODE_ENV=production
   WEBHOOK_PORT=3000
   
   # Evolution API Configuration
   SERVER_URL=https://evolution-api.onrender.com
   EVOLUTION_API_URL=https://evolution-api.onrender.com
   AUTHENTICATION_API_KEY=<mesma_chave_do_evolution_api>
   INSTANCE_NAME=default
   
   # WhatsApp Configuration
   DEFAULT_PHONE_NUMBER=<número_do_usuário>
   
   # OCP Configuration
   OCP_WS_URL=wss://seu-endpoint-ocp.com
   OCP_API_KEY=<sua_chave_ocp>
   
   # Optional
   OPENAI_API_KEY=<sua_chave_openai>  # Opcional - para transcrição de áudio
   LOGGING_ENDPOINT_URL=<url_do_endpoint_de_logging>
   ```

   **Importante**: 
   - `SERVER_URL` e `EVOLUTION_API_URL` devem ser a URL do serviço Evolution API
   - Substitua `<número_do_usuário>` pelo número real (ex: `18259622852`)
   - Substitua `<sua_chave_ocp>` pela chave real do OCP

### 6. URLs dos Serviços

Após o deploy, você terá URLs como:

- **WhatsApp Integration**: `https://whatsapp-integration.onrender.com`
- **Evolution API**: `https://evolution-api.onrender.com`
- **API Documentation (Swagger)**: `https://whatsapp-integration.onrender.com/api-docs`

### 7. Configurar Webhook na Evolution API

Após tudo rodando, configure o webhook usando a API REST:

```bash
# Opção 1: Via API REST do WhatsApp Integration
curl -X POST https://whatsapp-integration.onrender.com/api/webhook/setup \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://whatsapp-integration.onrender.com/webhook",
    "instanceName": "default"
  }'

# Opção 2: Diretamente na Evolution API
curl -X POST https://evolution-api.onrender.com/webhook/set/default \
  -H "apikey: SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://whatsapp-integration.onrender.com/webhook",
    "webhook_by_events": true,
    "webhook_base64": false,
    "events": [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATE"
    ]
  }'
```

### 8. Criar Instância do WhatsApp

Use a API REST para criar a instância:

```bash
curl -X POST https://whatsapp-integration.onrender.com/api/instances \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "default"}'
```

### 9. Obter QR Code

```bash
curl https://whatsapp-integration.onrender.com/api/instances/qr?instanceName=default
```

A resposta incluirá o QR code em base64. Você pode:
- Usar o campo `base64` para exibir a imagem
- Salvar o `qrCode` e converter para imagem

### 10. Escanear QR Code

1. Abra o WhatsApp no celular
2. Vá em **Configurações** > **Aparelhos conectados**
3. Toque em **"Conectar um aparelho"**
4. Escaneie o QR code

## 📚 API REST Disponível

Todos os comandos CLI agora estão disponíveis como endpoints REST:

### Endpoints Principais

- `GET /health` - Health check
- `GET /status` - Status do sistema
- `POST /webhook` - Webhook da Evolution API
- `POST /agent/message` - Enviar mensagem do agente

### Gerenciamento de Instâncias

- `GET /api/instances` - Listar instâncias
- `POST /api/instances` - Criar instância
- `GET /api/instances/qr` - Obter QR code
- `POST /api/instances/reconnect` - Reconectar instância
- `POST /api/instances/logout` - Desconectar instância

### Mensagens

- `POST /api/messages` - Enviar mensagem
- `POST /api/messages/ocp` - Enviar mensagem iniciada pelo OCP

### Configurações

- `GET /api/bot-mode` - Obter modo do bot
- `POST /api/bot-mode` - Configurar modo (proactive/reactive)
- `GET /api/agent-mode` - Status do modo agente
- `POST /api/agent-mode/enable` - Ativar modo agente
- `POST /api/agent-mode/disable` - Desativar modo agente
- `POST /api/webhook/setup` - Configurar webhook

### OCP

- `POST /api/ocp/restart` - Reiniciar sessão OCP
- `POST /api/ocp/start-conversation` - Iniciar conversa

### Documentação Interativa

Acesse a documentação Swagger completa em:

**`https://whatsapp-integration.onrender.com/api-docs`**

## ⚠️ Importante: Serviços Free "Dormem"

No plano free do Render, serviços web "dormem" após 15 minutos de inatividade.

### Solução Recomendada: UptimeRobot (Grátis)

1. Crie conta em [uptimerobot.com](https://uptimerobot.com)
2. Adicione monitors para:
   - **WhatsApp Integration**: `https://whatsapp-integration.onrender.com/health` (ping a cada 5 minutos)
   - **Evolution API**: `https://evolution-api.onrender.com` (ping a cada 5 minutos)
3. Isso mantém os serviços ativos 24/7

### Alternativa: Upgrade para Plano Pago

- $7/mês por serviço web
- Serviços nunca "dormem"
- Melhor para produção

## 🔧 Troubleshooting

### Serviço não inicia

1. Verifique os logs no dashboard do Render
2. Confirme que todas as variáveis de ambiente estão configuradas
3. Verifique se o `DATABASE_URL` está conectado corretamente (Evolution API)
4. Verifique se o `REDIS_URL` está conectado corretamente

### Evolution API não conecta

1. Verifique se a URL `SERVER_URL` está correta
2. Confirme que o serviço Evolution API está rodando
3. Verifique os logs do Evolution API no dashboard
4. Certifique-se de que o `DATABASE_URL` está configurado

### Webhook não recebe mensagens

1. Verifique se o webhook foi configurado corretamente
2. Confirme que a URL do webhook está acessível
3. Verifique os logs do serviço WhatsApp Integration
4. Teste o endpoint `/health` para confirmar que o serviço está rodando

### WebSocket OCP não conecta

1. Verifique se `OCP_WS_URL` está configurado corretamente
2. Confirme que `OCP_API_KEY` está configurado
3. Verifique os logs para erros de conexão
4. Render free pode ter limitações com WebSockets - considere upgrade

### QR Code não aparece

1. Verifique se a instância foi criada
2. Confirme que o Evolution API está rodando
3. Tente reconectar: `POST /api/instances/reconnect`
4. Verifique os logs do Evolution API

## 📝 Checklist Pós-Deploy

- [ ] PostgreSQL criado e `DATABASE_URL` configurado
- [ ] Redis criado e `REDIS_URL` configurado
- [ ] Evolution API deployado e rodando
- [ ] WhatsApp Integration deployado e rodando
- [ ] Todas as variáveis de ambiente configuradas
- [ ] Webhook configurado na Evolution API
- [ ] Instância WhatsApp criada
- [ ] QR code obtido e escaneado
- [ ] UptimeRobot configurado para manter serviços ativos
- [ ] API testada via Swagger (`/api-docs`)

## 🎯 Próximos Passos

Após o deploy completo:

1. ✅ Acesse a documentação Swagger: `https://whatsapp-integration.onrender.com/api-docs`
2. ✅ Teste os endpoints via Swagger UI
3. ✅ Configure o webhook
4. ✅ Crie a instância do WhatsApp
5. ✅ Escaneie o QR code
6. ✅ Teste o sistema enviando uma mensagem
7. ✅ Configure UptimeRobot para manter serviços ativos

## 📖 Documentação Adicional

- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Documentação completa da API REST
- [DEPLOY_QUICK_START.md](./DEPLOY_QUICK_START.md) - Checklist rápido de deploy
- [STRUCTURE.md](./STRUCTURE.md) - Estrutura do projeto
