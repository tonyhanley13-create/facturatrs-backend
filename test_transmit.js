const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const dgiiService = require('./dist/services/dgii.service');

async function run() {
  try {
    const trackId = 'f7bbde97-e307-4615-8f23-2b6a0eb5abb9';
    console.log(`Checking status for trackId: ${trackId}`);
    const result = await dgiiService.checkStatus(trackId, 1, 'Test');
    console.log('=== DGII Status Result ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
