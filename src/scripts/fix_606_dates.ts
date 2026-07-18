import prisma from '../models/db';

async function main() {
  console.log('✏️ Updating all purchase records for Company 1 to June 2026...');

  const purchases = await prisma.purchaseRecord.findMany({
    where: { company_id: 1 },
  });

  for (const p of purchases) {
    const originalDate = p.fecha;
    // Usar la fecha UTC para evitar desajustes de zona horaria
    const day = originalDate.getUTCDate();
    const newDate = new Date(Date.UTC(2026, 5, day)); // 5 representa Junio en base 0

    await prisma.purchaseRecord.update({
      where: { id: p.id },
      data: { fecha: newDate },
    });

    console.log(`✅ ID ${p.id} (${p.ncf}): ${originalDate.toISOString().split('T')[0]} ➡️ ${newDate.toISOString().split('T')[0]}`);
  }

  console.log('🎉 All dates updated to June 2026 successfully!');
}

main()
  .catch((e) => {
    console.error('Error running script:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
