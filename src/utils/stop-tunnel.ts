import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const TUNNEL_URL_FILE = path.join(process.cwd(), 'tunnel-url.txt');

function stopTunnel() {
  const timestamp = new Date().toISOString();
  console.log(`\n🛑 Parando túnel...\n`);

  try {
    // Find and kill tunnel processes
    try {
      execSync('pkill -f "expose-tunnel"', { stdio: 'ignore' });
      console.log(`[${timestamp}] ✅ Processo do túnel parado`);
    } catch (error: any) {
      // Process might not be running
      console.log(`[${timestamp}] ℹ️  Nenhum processo do túnel encontrado`);
    }

    // Remove tunnel URL file
    if (fs.existsSync(TUNNEL_URL_FILE)) {
      fs.unlinkSync(TUNNEL_URL_FILE);
      console.log(`[${timestamp}] ✅ Arquivo tunnel-url.txt removido`);
    }

    console.log(`\n[${timestamp}] ✅ Túnel parado com sucesso\n`);
  } catch (error: any) {
    console.error(`\n[${timestamp}] ❌ Erro ao parar túnel: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  stopTunnel();
}

export { stopTunnel };

