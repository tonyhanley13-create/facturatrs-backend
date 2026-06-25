import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function checkProductLimit(userId: number): Promise<boolean> {
  const settings = await prisma.companySettings.findFirst({
    where: { user_id: userId },
  });

  if (!settings) return true;

  const limits = settings.plan_type === 'starter' ? 20 : 1000; 

  const currentCount = await prisma.productService.count({
    where: {
      user_id: userId,
      is_active: true,
    },
  });

  return currentCount < limits;
}

async function main() {
  console.log('--- Testing Full Creation Workflow ---');
  
  try {
    // We assume a user exists (e.g., id: 15)
    const userId = 15; 

    // 1. Check Product Limit
    console.log(`Checking product limit for user ${userId}...`);
    const canCreate = await checkProductLimit(userId);
    console.log(`Can create product: ${canCreate}`);

    // 2. Create Product
    console.log('Creating product...');
    const newProduct = await prisma.productService.create({
      data: {
        user_id: userId,
        type: 'service',
        name: 'Workflow Test',
        description: 'Testing the full workflow',
        unit_price: new Decimal(200.0),
        category: 'Test',
        code: 'TEST-001',
        tax_percentage: new Decimal(18.0),
      },
    });
    console.log('✅ Product created with full workflow:', newProduct.id);

  } catch (error: any) {
    console.error('❌ Error in workflow:', error.message);
    if (error.code) console.error('Error Code:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

main();
