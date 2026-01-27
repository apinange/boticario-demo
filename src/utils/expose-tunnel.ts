import localtunnel from 'localtunnel';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const PORT = parseInt(process.env.WEBHOOK_PORT || '3000', 10);
const TUNNEL_URL_FILE = path.join(process.cwd(), 'tunnel-url.txt');
const KEEPALIVE_INTERVAL = 60000; // 60 seconds - check if tunnel is alive (less aggressive)

let tunnel: any = null;
let keepaliveInterval: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let tunnelCreatedAt: number = 0; // Track when tunnel was created
const MIN_TUNNEL_AGE_MS = 10000; // Don't reconnect if tunnel is less than 10 seconds old

async function checkTunnelHealth(publicUrl: string): Promise<boolean> {
  try {
    const response = await axios.get(`${publicUrl}/health`, {
      timeout: 5000,
      validateStatus: () => true // Don't throw on any status
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function exposeTunnel() {
  // Clear previous keepalive if exists
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }

  // Close previous tunnel if exists
  if (tunnel) {
    try {
      tunnel.close();
    } catch (error) {
      // Ignore errors when closing
    }
    tunnel = null;
  }

  // Check if local server is running before creating tunnel
  try {
    const localHealth = await axios.get(`http://localhost:${PORT}/health`, {
      timeout: 3000,
      validateStatus: () => true
    });
    if (localHealth.status !== 200) {
      console.error(`\n❌ Servidor local não está respondendo na porta ${PORT}`);
      console.error(`   Status: ${localHealth.status}`);
      console.error(`   Verifique se o servidor está rodando antes de criar o túnel\n`);
      reconnectTunnel();
      return;
    }
  } catch (error) {
    console.error(`\n❌ Não foi possível conectar ao servidor local na porta ${PORT}`);
    console.error(`   Verifique se o servidor está rodando: npm run webhook\n`);
    reconnectTunnel();
    return;
  }

  console.log(`\n🌐 Iniciando túnel público para expor servidor local...`);
  console.log(`   Porta local: ${PORT}`);
  if (reconnectAttempts > 0) {
    console.log(`   Tentativa de reconexão: ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
  }
  
  const subdomain = process.env.TUNNEL_SUBDOMAIN || undefined;
  if (subdomain) {
    console.log(`   Subdomain fixo: ${subdomain}`);
    console.log(`   ⚠️  Se o subdomain estiver em uso, tentará usar subdomain aleatório`);
  }
  console.log(`   Aguarde, criando túnel...\n`);

  try {
    let tunnelCreated = false;
    
    // Tentar com subdomain fixo primeiro (se especificado)
    if (subdomain) {
      try {
        console.log(`   Tentando criar tunnel com subdomain fixo: ${subdomain}...`);
        const tunnelOptions: any = {
          port: PORT,
          subdomain: subdomain
        };
        
        // Timeout de 15 segundos para subdomain fixo
        const tunnelPromise = localtunnel(tunnelOptions);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Timeout'));
          }, 15000);
        });
        
        tunnel = await Promise.race([tunnelPromise, timeoutPromise]) as any;
        tunnelCreated = true;
        console.log(`   ✅ Tunnel criado com subdomain fixo: ${subdomain}`);
      } catch (error: any) {
        console.log(`   ⚠️  Falha ao criar com subdomain fixo: ${error.message}`);
        console.log(`   Tentando criar tunnel com subdomain aleatório...`);
      }
    }
    
    // Se não conseguiu com subdomain fixo, tentar sem subdomain (aleatório)
    if (!tunnelCreated) {
      const tunnelOptions: any = {
        port: PORT,
        subdomain: undefined
      };
      
      // Timeout de 20 segundos para subdomain aleatório
      const tunnelPromise = localtunnel(tunnelOptions);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Timeout'));
        }, 20000);
      });
      
      tunnel = await Promise.race([tunnelPromise, timeoutPromise]) as any;
    }

    const publicUrl = tunnel.url;
    reconnectAttempts = 0; // Reset on successful connection
    tunnelCreatedAt = Date.now(); // Track when tunnel was created
    
    // Save URL to file
    fs.writeFileSync(TUNNEL_URL_FILE, publicUrl, 'utf-8');
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ TÚNEL PÚBLICO CRIADO COM SUCESSO!`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\n🌐 URL Pública: ${publicUrl}`);
    console.log(`\n📡 Endpoints disponíveis:`);
    console.log(`   - Webhook: ${publicUrl}/webhook`);
    console.log(`   - Health: ${publicUrl}/health`);
    console.log(`   - Status: ${publicUrl}/status`);
    console.log(`   - Agent Message: ${publicUrl}/agent/message`);
    console.log(`\n💡 Use esta URL no frontend para enviar mensagens do agente`);
    console.log(`💡 URL salva em: ${TUNNEL_URL_FILE}`);
    console.log(`\n⚠️  Mantenha este processo rodando para manter o túnel ativo`);
    console.log(`   Pressione Ctrl+C para fechar o túnel\n`);
    console.log(`${'='.repeat(80)}\n`);

    // Keepalive disabled for now - rely on tunnel's own close/error events
    // The tunnel will automatically reconnect if it closes
    // Uncomment below to enable keepalive checks (may cause issues with localtunnel)
    /*
    setTimeout(() => {
      if (tunnel) {
    keepaliveInterval = setInterval(async () => {
          const tunnelAge = Date.now() - tunnelCreatedAt;
          if (tunnelAge < MIN_TUNNEL_AGE_MS) {
            return;
          }

      const isHealthy = await checkTunnelHealth(publicUrl);
      if (!isHealthy) {
        const timestamp = new Date().toISOString();
        console.log(`\n[${timestamp}] ⚠️  Túnel não está respondendo! Reconectando...\n`);
        if (keepaliveInterval) {
          clearInterval(keepaliveInterval);
          keepaliveInterval = null;
        }
        reconnectTunnel();
      }
    }, KEEPALIVE_INTERVAL);
      }
    }, 10000);
    */

    // Handle tunnel close
    tunnel.on('close', () => {
      const timestamp = new Date().toISOString();
      const tunnelAge = Date.now() - tunnelCreatedAt;
      
      // Don't reconnect immediately if tunnel just closed (might be temporary)
      if (tunnelAge < MIN_TUNNEL_AGE_MS) {
        console.log(`\n[${timestamp}] ⚠️  Túnel fechado muito cedo (${Math.round(tunnelAge / 1000)}s). Aguardando antes de reconectar...\n`);
        // Wait a bit before reconnecting
        setTimeout(() => {
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
          }
          reconnectTunnel();
        }, 5000);
      } else {
      console.log(`\n[${timestamp}] ⚠️  Túnel fechado. Tentando reconectar...\n`);
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
      reconnectTunnel();
      }
    });

    // Handle errors
    tunnel.on('error', (error: any) => {
      const timestamp = new Date().toISOString();
      const tunnelAge = Date.now() - tunnelCreatedAt;
      
      // Don't reconnect immediately for errors on new tunnels
      if (tunnelAge < MIN_TUNNEL_AGE_MS) {
        console.error(`\n[${timestamp}] ⚠️  Erro no túnel (muito novo): ${error.message}`);
        console.error(`[${timestamp}]    Aguardando antes de reconectar...\n`);
        setTimeout(() => {
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
          }
          reconnectTunnel();
        }, 5000);
      } else {
      console.error(`\n[${timestamp}] ❌ Erro no túnel: ${error.message}`);
      console.error(`[${timestamp}]    Tentando reconectar...\n`);
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
      reconnectTunnel();
      }
    });

    // Cleanup on process exit
    process.on('SIGINT', () => {
      console.log(`\n🛑 Fechando túnel...`);
      cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log(`\n🛑 Fechando túnel...`);
      cleanup();
      process.exit(0);
    });

  } catch (error: any) {
    const subdomain = process.env.TUNNEL_SUBDOMAIN;
    const timestamp = new Date().toISOString();
    
    console.error(`\n❌ Erro ao criar túnel: ${error.message}`);
    
    if (error.message && error.message.includes('Timeout')) {
      console.error(`\n⚠️  TIMEOUT ao criar tunnel`);
      if (subdomain) {
        console.error(`   O subdomain "${subdomain}" pode estar em uso por outro usuário.`);
        console.error(`   Opções:`);
        console.error(`   1. Tente usar outro subdomain (ex: ${subdomain}2, ${subdomain}-dev)`);
        console.error(`   2. Remova TUNNEL_SUBDOMAIN do .env para usar subdomain aleatório`);
        console.error(`   3. Aguarde alguns minutos e tente novamente`);
      } else {
        console.error(`   O servidor do localtunnel pode estar lento. Tente novamente.`);
      }
    } else if (error.message && (error.message.includes('subdomain') || error.message.includes('already in use'))) {
      console.error(`\n⚠️  SUBDOMAIN EM USO`);
      if (subdomain) {
        console.error(`   O subdomain "${subdomain}" já está sendo usado por outro usuário.`);
        console.error(`   Use outro subdomain ou remova TUNNEL_SUBDOMAIN do .env`);
      }
    } else {
      console.error(`   Verifique se o servidor está rodando na porta ${PORT}`);
    }
    
    reconnectTunnel();
  }
}

function reconnectTunnel() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`\n❌ Número máximo de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS})`);
    console.error(`   Por favor, reinicie o túnel manualmente: npm run expose\n`);
    process.exit(1);
  }

  reconnectAttempts++;
  // Increase delay: start with 10 seconds, max 60 seconds
  const delay = Math.min(10000 + (5000 * reconnectAttempts), 60000);
  
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔄 Tentando reconectar em ${delay / 1000} segundo(s)...`);
  console.log(`[${timestamp}]    Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
  console.log(`[${timestamp}]    Verifique se o servidor local está rodando na porta ${PORT}\n`);
  
  setTimeout(() => {
    exposeTunnel();
  }, delay);
}

function cleanup() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
  if (tunnel) {
    try {
      tunnel.close();
    } catch (error) {
      // Ignore errors
    }
    tunnel = null;
  }
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    fs.unlinkSync(TUNNEL_URL_FILE);
  }
}

if (require.main === module) {
  exposeTunnel();
}

export { exposeTunnel };

