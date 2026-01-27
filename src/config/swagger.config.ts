import swaggerJsdoc from 'swagger-jsdoc';
import { config } from './env.config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WhatsApp Integration API',
      version: '1.0.0',
      description: 'API para integração WhatsApp com Evolution API e OCP (Omilia Chat Platform)',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Status', description: 'System status endpoints' },
      { name: 'Webhook', description: 'Webhook endpoints' },
      { name: 'Agent', description: 'Agent message endpoints' },
      { name: 'Instance', description: 'WhatsApp instance management' },
      { name: 'Message', description: 'Message sending endpoints' },
      { name: 'Bot Mode', description: 'Bot mode configuration' },
      { name: 'Agent Mode', description: 'Agent mode management' },
      { name: 'OCP', description: 'OCP session management' },
      { name: 'Webhook Config', description: 'Webhook configuration' },
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
          },
        },
        Instance: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            connectionStatus: { type: 'string' },
            integration: { type: 'string' },
            number: { type: 'string' },
            profileName: { type: 'string' },
          },
        },
        QrCode: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            qrCode: { type: 'string', description: 'Base64 QR code' },
            base64: { type: 'string', description: 'Data URI for image' },
          },
        },
        BotMode: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            mode: { type: 'string', enum: ['PROACTIVE', 'REACTIVE'] },
          },
        },
        AgentMode: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            phoneNumber: { type: 'string' },
            agentMode: { type: 'boolean' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
