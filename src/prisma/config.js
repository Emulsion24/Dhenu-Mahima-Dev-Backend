import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();


const globalForPrisma = globalThis;

// Create singleton Prisma client
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
           
      },
    },
    
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Function to connect with retry
const connectWithRetry = async (retries = 5, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();

      console.log('✅ Database connected successfully');
      return;
    } catch (err) {
      console.error(`❌ Connection attempt ${i + 1} failed:`, err.message);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error('❌ Could not connect to the database after multiple attempts');
};

connectWithRetry();

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Closing Prisma Client...`);
  try {
    await prisma.$disconnect();
    console.log('Prisma Client disconnected successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during Prisma disconnect:', error);
    process.exit(1);
  }
};

// Handle termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker/K8s
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await prisma.$disconnect();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await prisma.$disconnect();
  process.exit(1);
});
