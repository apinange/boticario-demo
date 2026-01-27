import * as fs from 'fs';
import * as path from 'path';

const TUNNEL_URL_FILE = path.join(process.cwd(), 'tunnel-url.txt');

function getTunnelUrl(): void {
  try {
    if (fs.existsSync(TUNNEL_URL_FILE)) {
      const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim();
      console.log(`\n🌐 URL do túnel público:`);
      console.log(`   ${url}`);
      console.log(`\n📡 Endpoint do agente:`);
      console.log(`   ${url}/agent/message`);
      console.log(`\n`);
    } else {
      console.log(`\n⚠️  Túnel não está ativo.`);
      console.log(`   Execute 'npm run expose' em outro terminal para criar o túnel.\n`);
    }
  } catch (error: any) {
    console.error(`\n❌ Erro ao ler URL do túnel: ${error.message}\n`);
  }
}

if (require.main === module) {
  getTunnelUrl();
}

export { getTunnelUrl };

