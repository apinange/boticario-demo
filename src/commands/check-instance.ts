import axios from 'axios';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';

async function checkInstances(): Promise<void> {
  try {
    const response = await axios.get(
      `${EVOLUTION_API_URL}/instance/fetchInstances`,
      {
        headers: {
          apikey: EVOLUTION_API_KEY
        },
        timeout: 10000
      }
    );

    if (response.status === 200) {
      const instances = response.data;
      console.log(`\n📱 Found ${Array.isArray(instances) ? instances.length : 0} instance(s):\n`);
      
      if (Array.isArray(instances) && instances.length > 0) {
        instances.forEach((instance: any) => {
          console.log(`Name: ${instance.name}`);
          console.log(`Status: ${instance.connectionStatus || 'unknown'}`);
          console.log(`Integration: ${instance.integration || 'unknown'}`);
          
          // Extract number from ownerJid or number field
          let phoneNumber = instance.number;
          if (!phoneNumber && instance.ownerJid) {
            // Extract from ownerJid format: 558184475278@s.whatsapp.net
            phoneNumber = instance.ownerJid.split('@')[0];
          }
          
          if (phoneNumber) {
            console.log(`Number: ${phoneNumber} ✅ CONNECTED`);
            if (instance.profileName) {
              console.log(`Profile: ${instance.profileName}`);
            }
          } else {
            console.log(`Number: not connected`);
          }
          console.log('---');
        });
      } else {
        console.log('No instances found. Create one via Manager Web: http://localhost:8080/manager/');
      }
    }
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        console.error(`❌ Cannot connect to Evolution API at ${EVOLUTION_API_URL}`);
        console.error('Make sure Evolution API is running: npm run start (in evolution-api directory)');
      } else {
        console.error('❌ Error:', error.message);
      }
    } else {
      console.error('❌ Error:', error);
    }
    process.exit(1);
  }
}

checkInstances();

