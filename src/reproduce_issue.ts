import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Testing User and Product Creation ---');
  
  try {
    // 1. Create User
    const email = `test_${Date.now()}@example.com`;
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    console.log(`Creating user: ${email}...`);
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        first_name: 'Test',
        last_name: 'User',
        company_name: 'Test Corp',
      },
    });
    console.log('✅ User created:', newUser.id);

    // 2. Create Product (Service)
    console.log('Creating product...');
    const newProduct = await prisma.productService.create({
      data: {
        user_id: newUser.id,
        name: 'Service Test',
        unit_price: 100.0,
        type: 'service',
      },
    });
    console.log('✅ Product created:', newProduct.id);

  } catch (error: any) {
    console.error('❌ Error in creation:', error.message);
    if (error.code) console.error('Error Code:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

main();
