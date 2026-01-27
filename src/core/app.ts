import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { corsConfig } from '../config/cors.config';
import { config } from '../config/env.config';
import { getOCPClient } from './ocp-websocket';
import { swaggerSpec } from '../config/swagger.config';
import routes from '../routes/index.routes';
import { webhookConfigService } from '../services/webhook-config.service';

const app = express();

// Middleware
app.use(corsConfig);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Swagger documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'WhatsApp Integration API Documentation'
}));

// Routes
app.use('/', routes);

// Initialize OCP client on startup
function initializeOCP() {
  const timestamp = new Date().toISOString();
  const ocpUrl = config.ocpWsUrl;
  
  if (ocpUrl === 'Not configured' || ocpUrl === 'wss://your-ocp-endpoint.com') {
    console.error(`\n${'='.repeat(80)}`);
    console.error(`[${timestamp}] ⚠️  ATENÇÃO: OCP_WS_URL não está configurado!`);
    console.error(`[${timestamp}]    Configure no .env: OCP_WS_URL=wss://seu-endpoint-ocp.com`);
    console.error(`${'='.repeat(80)}\n`);
    return;
  }
  
  console.log(`[${timestamp}] 🔌 Initializing OCP WebSocket connection...`);
  try {
    const ocpClient = getOCPClient();
    console.log(`[${timestamp}] ✅ OCP client initialized - will attempt to connect\n`);
  } catch (error: any) {
    console.error(`[${timestamp}] ❌ Failed to initialize OCP client:`, error.message);
  }
}

// Auto-configure webhook on startup
async function autoSetupWebhook() {
  const timestamp = new Date().toISOString();
  
  // Get webhook URL for logging
  const webhookUrl = process.env.WEBHOOK_SERVER_URL || 
                    process.env.WHATSAPP_INTEGRATION_URL ||
                    process.env.RENDER_EXTERNAL_URL ||
                    `http://localhost:${config.port}`;
  
  console.log(`[${timestamp}] 🔧 Auto-configurando webhook...`);
  console.log(`[${timestamp}]    Instance: ${config.instanceName}`);
  console.log(`[${timestamp}]    Webhook URL: ${webhookUrl}/webhook`);
  
  // Warn if using localhost in production
  if (process.env.NODE_ENV === 'production' && webhookUrl.includes('localhost')) {
    console.warn(`[${timestamp}] ⚠️  ATENÇÃO: Usando localhost em produção!`);
    console.warn(`[${timestamp}]    Configure WEBHOOK_SERVER_URL ou WHATSAPP_INTEGRATION_URL no Render`);
    console.warn(`[${timestamp}]    Ou use RENDER_EXTERNAL_URL (disponível automaticamente no Render)`);
  }
  
  try {
    await webhookConfigService.autoSetupWebhook(config.instanceName);
    console.log(`[${timestamp}] ✅ Webhook configurado automaticamente com sucesso!\n`);
  } catch (error: any) {
    // Don't fail startup if webhook setup fails - already logged in autoSetupWebhook
    console.warn(`[${timestamp}] ⚠️  Não foi possível configurar webhook automaticamente.`);
    console.warn(`[${timestamp}]    O webhook será configurado automaticamente quando a instância for criada.\n`);
  }
}

export function startServer() {
  const timestamp = new Date().toISOString();
  
  app.listen(config.port, () => {
    console.log(`\n[${timestamp}] 🚀 Webhook server started`);
    console.log(`[${timestamp}]    URL: http://localhost:${config.port}`);
    console.log(`[${timestamp}]    Webhook endpoint: http://localhost:${config.port}/webhook`);
    console.log(`[${timestamp}]    Health check: http://localhost:${config.port}/health`);
    console.log(`[${timestamp}]    API Documentation: http://localhost:${config.port}/api-docs`);
    
    // Check OpenAI API Key for audio transcription
    if (!config.openaiApiKey) {
      console.warn(`\n${'='.repeat(80)}`);
      console.warn(`[${timestamp}] ⚠️  OPENAI_API_KEY não configurada!`);
      console.warn(`[${timestamp}]    A transcrição de áudio não funcionará sem esta chave.`);
      console.warn(`[${timestamp}]    Configure no .env: OPENAI_API_KEY=sk-...`);
      console.warn(`${'='.repeat(80)}\n`);
    } else {
      console.log(`[${timestamp}] ✅ Audio transcription enabled (OpenAI Whisper)`);
    }
    
    console.log(`[${timestamp}]    OCP WebSocket: ${config.ocpWsUrl}`);
    console.log(`\n[${timestamp}] 📋 Ready to receive webhooks from Evolution API`);
    console.log(`[${timestamp}] 📋 Ready to connect to OCP WebSocket`);
    console.log(`[${timestamp}] 📋 Agent endpoint: http://localhost:${config.port}/agent/message\n`);
    
    // Initialize OCP client
    initializeOCP();
    
    // Auto-configure webhook (non-blocking)
    setTimeout(() => {
      autoSetupWebhook().catch((error) => {
        console.error(`[${new Date().toISOString()}] ❌ Error in auto webhook setup:`, error.message);
      });
    }, 2000); // Wait 2 seconds for server to be fully ready
  });
}

export default app;
