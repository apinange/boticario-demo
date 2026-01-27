import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
  webhookSecret: process.env.WEBHOOK_SECRET || '',

  // Evolution API
  evolutionApiUrl: process.env.SERVER_URL || process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  evolutionApiKey: process.env.AUTHENTICATION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11',
  instanceName: process.env.INSTANCE_NAME || 'default',
  defaultPhoneNumber: process.env.DEFAULT_PHONE_NUMBER || '13688852974',

  // OCP
  ocpWsUrl: process.env.OCP_WS_URL || 'wss://your-ocp-endpoint.com',
  ocpApiKey: process.env.OCP_API_KEY || '',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // Logging
  loggingEndpointUrl: process.env.LOGGING_ENDPOINT_URL || '',
};
