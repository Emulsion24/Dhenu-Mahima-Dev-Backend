import corn from "node-cron";
import {prisma} from "../prisma/config.js"


// Function to delete expired events
export const deleteExpiredEvents = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await prisma.event.deleteMany({
      where: {
        endDate: {
          lt: today
        }
      }
    });
    
    console.log(`[${new Date().toISOString()}] Auto-cleanup: Deleted ${result.count} expired events`);
    return result.count;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error during auto-cleanup:`, error);
    throw error;
  }
};

// Schedule cleanup to run daily at midnight
export const startScheduler = () => {
  // Run every day at 00:00 (midnight)
  corn.schedule('0 0 * * *', async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled cleanup of expired events...`);
    await deleteExpiredEvents();
  });

  // Also run at server startup
  console.log('Event cleanup scheduler started. Will run daily at midnight.');
  console.log('Running initial cleanup...');
  deleteExpiredEvents();
};

