# API Documentation

## Swagger UI

Acesse a documentação interativa da API em:

```
http://localhost:3000/api-docs
```

## Endpoints Disponíveis

### Health & Status

- `GET /health` - Health check do serviço
- `GET /status` - Status do sistema e conexão OCP

### Webhook

- `POST /webhook` - Endpoint para receber webhooks da Evolution API
- `POST /api/webhook/setup` - Configurar webhook para uma instância

### Agent

- `POST /agent/message` - Enviar mensagem do agente para WhatsApp

### Instance Management

- `GET /api/instances` - Listar todas as instâncias WhatsApp
- `POST /api/instances` - Criar nova instância
- `GET /api/instances/qr` - Obter QR code para conectar WhatsApp
- `POST /api/instances/reconnect` - Reconectar instância e gerar novo QR code
- `POST /api/instances/logout` - Desconectar instância

### Messages

- `POST /api/messages` - Enviar mensagem de texto para WhatsApp
- `POST /api/messages/ocp` - Enviar mensagem iniciada pelo OCP

### Bot Mode

- `GET /api/bot-mode` - Obter modo atual do bot (proactive/reactive)
- `POST /api/bot-mode` - Configurar modo do bot

### Agent Mode

- `GET /api/agent-mode` - Verificar se um número está em modo agente
- `GET /api/agent-mode/list` - Listar todos os números em modo agente
- `POST /api/agent-mode/enable` - Ativar modo agente para um número
- `POST /api/agent-mode/disable` - Desativar modo agente para um número
- `POST /api/agent-mode/clear` - Remover todos os modos agente

### OCP Management

- `POST /api/ocp/restart` - Reiniciar sessão OCP
- `POST /api/ocp/start-conversation` - Iniciar conversa (modo proactive)

## Exemplos de Uso

### Criar Instância

```bash
curl -X POST http://localhost:3000/api/instances \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "default"}'
```

### Obter QR Code

```bash
curl http://localhost:3000/api/instances/qr?instanceName=default
```

### Enviar Mensagem

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "5511999999999",
    "text": "Olá!"
  }'
```

### Configurar Bot Mode

```bash
curl -X POST http://localhost:3000/api/bot-mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "proactive"}'
```

### Ativar Agent Mode

```bash
curl -X POST http://localhost:3000/api/agent-mode/enable \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "5511999999999"}'
```

## Documentação Completa

Para ver a documentação completa com exemplos, schemas e detalhes, acesse:

**http://localhost:3000/api-docs**
