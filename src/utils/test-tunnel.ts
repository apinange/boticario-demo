import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const TUNNEL_URL_FILE = path.join(process.cwd(), 'tunnel-url.txt');
const LOCAL_PORT = parseInt(process.env.WEBHOOK_PORT || '3000', 10);

async function testTunnel() {
  console.log(`\n🧪 Testando túnel e servidor local...\n`);

  // 1. Check if tunnel URL file exists
  let tunnelUrl: string | null = null;
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    tunnelUrl = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
    console.log(`✅ Arquivo tunnel-url.txt encontrado`);
    console.log(`   URL: ${tunnelUrl}\n`);
  } else {
    console.log(`❌ Arquivo tunnel-url.txt não encontrado`);
    console.log(`   Execute 'npm run expose' primeiro para criar o túnel\n`);
  }

  // 2. Test local server
  console.log(`🔍 Testando servidor local (http://localhost:${LOCAL_PORT})...`);
  try {
    const localResponse = await axios.get(`http://localhost:${LOCAL_PORT}/health`, {
      timeout: 5000
    });
    console.log(`✅ Servidor local está respondendo`);
    console.log(`   Status: ${localResponse.status}`);
    console.log(`   Response: ${JSON.stringify(localResponse.data)}\n`);
  } catch (error: any) {
    console.log(`❌ Servidor local NÃO está respondendo`);
    console.log(`   Erro: ${error.message}`);
    console.log(`   Verifique se o servidor está rodando na porta ${LOCAL_PORT}\n`);
    return;
  }

  // 3. Test tunnel if URL exists
  if (tunnelUrl) {
    console.log(`🔍 Testando túnel público (${tunnelUrl})...`);
    
    // Test health endpoint
    try {
      const healthUrl = `${tunnelUrl}/health`;
      console.log(`   Testando: ${healthUrl}`);
      const tunnelResponse = await axios.get(healthUrl, {
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      });
      
      if (tunnelResponse.status === 200) {
        console.log(`✅ Túnel está acessível!`);
        console.log(`   Status: ${tunnelResponse.status}`);
        console.log(`   Response: ${JSON.stringify(tunnelResponse.data)}\n`);
      } else {
        console.log(`⚠️  Túnel respondeu mas com status inesperado`);
        console.log(`   Status: ${tunnelResponse.status}`);
        console.log(`   Response: ${tunnelResponse.data || tunnelResponse.statusText}\n`);
      }
    } catch (error: any) {
      console.log(`❌ Túnel NÃO está acessível`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${error.response.data || error.response.statusText}`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   Erro: Conexão recusada - túnel pode estar offline`);
      } else if (error.code === 'ETIMEDOUT') {
        console.log(`   Erro: Timeout - túnel pode estar lento ou offline`);
      } else {
        console.log(`   Erro: ${error.message}`);
      }
      console.log(`\n💡 Soluções:`);
      console.log(`   1. Verifique se 'npm run expose' está rodando`);
      console.log(`   2. Tente parar e reiniciar o túnel`);
      console.log(`   3. Verifique sua conexão com a internet\n`);
      return;
    }

    // Test agent endpoint
    console.log(`🔍 Testando endpoint do agente (${tunnelUrl}/agent/message)...`);
    try {
      const agentUrl = `${tunnelUrl}/agent/message`;
      const testPayload = {
        phoneNumber: "13688852974",
        text: "Teste de conexão"
      };
      
      console.log(`   Payload: ${JSON.stringify(testPayload)}`);
      const agentResponse = await axios.post(agentUrl, testPayload, {
        timeout: 10000,
        validateStatus: () => true // Don't throw on any status
      });
      
      if (agentResponse.status === 200 || agentResponse.status === 400) {
        console.log(`✅ Endpoint do agente está acessível!`);
        console.log(`   Status: ${agentResponse.status}`);
        console.log(`   Response: ${JSON.stringify(agentResponse.data)}\n`);
      } else {
        console.log(`⚠️  Endpoint respondeu mas com status inesperado`);
        console.log(`   Status: ${agentResponse.status}`);
        console.log(`   Response: ${agentResponse.data || agentResponse.statusText}\n`);
      }
    } catch (error: any) {
      console.log(`❌ Endpoint do agente NÃO está acessível`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${error.response.data || error.response.statusText}`);
      } else {
        console.log(`   Erro: ${error.message}`);
      }
      console.log(`\n`);
    }
  }

  console.log(`\n📋 Resumo:`);
  console.log(`   - Servidor local: ${fs.existsSync(TUNNEL_URL_FILE) ? '✅' : '❌'}`);
  console.log(`   - Túnel URL: ${tunnelUrl ? '✅' : '❌'}`);
  console.log(`\n`);
}

if (require.main === module) {
  testTunnel();
}

export { testTunnel };

