import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  try {
    const sqlPath = path.join(__dirname, '../prisma/rename_settings.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by GO or just execute the whole thing if the driver supports it
    // sp_rename must be run separately for each item usually
    const lines = sql.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('EXEC sp_rename') || line.startsWith('USE')) {
        // Remove semicolon if present at the end for SQL Server
        const cmd = line.endsWith(';') ? line.slice(0, -1) : line;
        console.log(`Executing: ${cmd}`);
        try {
          await prisma.$executeRawUnsafe(cmd);
        } catch (e: any) {
          console.error(`Error executing ${cmd}: ${e.message}`);
        }
      }
    }
    console.log('✅ Renaming process completed.');
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
