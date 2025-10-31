import cron from 'node-cron';
import { prisma } from '../prisma/config.js';
import { 
  checkAllSubscriptionStatuses, 
  autoNotifyAnnualRedemptions, 
  checkAndExecuteRedemptions 
} from '../controllers/magazinePaymentController.js';

/**
 * Setup all cron jobs for subscription management
 * Compliant with PhonePe 24-hour pre-debit notification requirement
 */
export function setupSubscriptionCronJobs() {
  console.log('⏰ Setting up subscription cron jobs (24h+ compliance)...');

  // 1. Check all subscription statuses - Every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 [CRON] Running subscription status check...');
    try {
      await checkAllSubscriptionStatuses();
    } catch (error) {
      console.error('❌ [CRON] Subscription status check failed:', error);
    }
  });

  // 2. Send pre-debit notifications - Every day at 3 AM
  // Notifies users 2-3 days (48-72 hours) before billing
  cron.schedule('0 3 * * *', async () => {
    console.log('🔔 [CRON] Sending pre-debit notifications (48-72h advance)...');
    try {
      await autoNotifyAnnualRedemptions();
    } catch (error) {
      console.error('❌ [CRON] Redemption notification failed:', error);
    }
  });

  // 3. Check and execute redemptions - Every 4 hours
  // Only executes redemptions that were notified 24+ hours ago
  cron.schedule('0 */4 * * *', async () => {
    console.log('⚡ [CRON] Checking and executing redemptions (24h+ after notification)...');
    try {
      await checkAndExecuteRedemptions();
    } catch (error) {
      console.error('❌ [CRON] Redemption check/execution failed:', error);
    }
  });

  // 4. Quick status check - Every 2 hours
  // Checks status of executed redemptions
  cron.schedule('0 */2 * * *', async () => {
    console.log('🔍 [CRON] Quick redemption status check...');
    try {
      const twentyFourHoursAgo = new Date();
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

      const readyForExecution = await prisma.recurringPayment.count({
        where: {
          status: 'PENDING',
          notifiedAt: { lte: twentyFourHoursAgo },
          executedAt: null,
        },
      });

      if (readyForExecution > 0) {
        console.log(`⚠️ Found ${readyForExecution} redemptions ready for execution`);
        await checkAndExecuteRedemptions();
      }
    } catch (error) {
      console.error('❌ [CRON] Quick check failed:', error);
    }
  });

  console.log('✅ Subscription cron jobs setup complete (24h+ compliance)');
  console.log('   📅 Subscription status check: Daily at 2 AM');
  console.log('   🔔 Pre-debit notifications: Daily at 3 AM (48-72h before billing)');
  console.log('   ⚡ Redemption execution: Every 4 hours (24h+ after notification)');
  console.log('   🔍 Status check: Every 2 hours');
}