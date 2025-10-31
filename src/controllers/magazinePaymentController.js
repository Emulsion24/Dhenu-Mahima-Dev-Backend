import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { prisma } from "../prisma/config.js";
import { sendMembershipThankYouEmail} from "../services/emailService.js";
import { MetaInfo, StandardCheckoutPayRequest } from "pg-sdk-node";
import phonePe from "../utils/phonepeClient.js";
dotenv.config();

// PhonePe Configuration
const PHONEPE_CONFIG = {
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  clientId: process.env.PHONEPE_CLIENT_ID,
  clientSecret: process.env.PHONEPE_CLIENT_SECRET,
  clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
  saltKey: process.env.PHONEPE_SALT_KEY,
  saltIndex: process.env.PHONEPE_SALT_INDEX || '1',
  environment: process.env.PHONEPE_ENV || 'sandbox',
  callbackUrl: process.env.PHONEPE_CALLBACK_URL,
  redirectUrl: process.env.PHONEPE_REDIRECT_URL,
};

// Base URLs based on documentation
const getBaseUrl = () => {
  return PHONEPE_CONFIG.environment === 'production'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
};

const getAuthUrl = () => {
  return PHONEPE_CONFIG.environment === 'production'
    ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token';
};






/**
 * Generate Authorization Token for AutoPay APIs
 */
async function generateAuthToken() {
  try {
    const response = await axios.post(
      getAuthUrl(),
      new URLSearchParams({
        client_id: PHONEPE_CONFIG.clientId,
        client_version: PHONEPE_CONFIG.clientVersion,
        client_secret: PHONEPE_CONFIG.clientSecret,
        grant_type: 'client_credentials',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return {
      token: response.data.access_token,
      expiresAt: response.data.expires_at,
      tokenType: response.data.token_type,
    };
  } catch (error) {
    console.error('Error generating auth token:', error.response?.data || error.message);
    throw new Error('Failed to generate PhonePe auth token');
  }
}

/**
 * Generate unique IDs
 */
function generateMerchantIds() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  return {
    merchantTransactionId: `TXN_${timestamp}_${random}`,
    merchantUserId: `USER_${timestamp}_${random}`,
    merchantSubscriptionId: `SUB_${timestamp}_${random}`,
    merchantOrderId: `ORD_${timestamp}_${random}`,
  };
}

// ==================== ONE-TIME PAYMENT  ====================


async function initiateOneTimePayment(req, res) {
  try {
    const {
      userId,
      name,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      
    
    } = req.body;
const amount=11000;
    if (!name || !email || !phone ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, phone',
      });
    }

  

    const { merchantTransactionId, merchantUserId } = generateMerchantIds();
    const amountInPaise = Math.round(amount * 100);
 const redirectUrl = `${process.env.BACKEND_URL}/api/membership/order-status-onetime?orderId=${merchantTransactionId}`;

  const metaInfo = MetaInfo.builder()
       .udf1(String(userId)||name)
       .udf2("Life Time Membership Payment")
       .build();
       const request = StandardCheckoutPayRequest.builder()
             .merchantOrderId(merchantTransactionId)
             .amount(amountInPaise)
             .redirectUrl(redirectUrl)
             .metaInfo(metaInfo)
             .build();
    
    const response = await phonePe.pay(request);

   if (!response || !response.redirectUrl) {
      console.error("PhonePe Payment Error:", response);
      return res.status(500).json({ message: "Failed to initiate PhonePe payment" });
    }
   

    const payment = await prisma.membershipPayment.create({
      data: {
        userId: userId || null,
        name: name,
        email: email,
        phone: phone,
        address: address || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        membershipType:'Life Time',
        amount: amountInPaise,
        status: 'pending',
        transactionId: merchantTransactionId,
        orderId: merchantTransactionId,
        merchantOrderId: merchantTransactionId,
        paymentMethod: 'Phone Pe',
        
      },
    });

    await prisma.payment.create({
      data: {
        userId: userId || null,
        referenceId: merchantTransactionId,
        provider: 'PHONEPE',
        amount: amount,
        status: 'pending',
        type: 'one_time',
        metadata: JSON.stringify({ 
          membershipPaymentId: payment.id,
      
        }),
      },
    });

    return res.status(200).json({
      redirectUrl: response.redirectUrl,
      orderId: merchantTransactionId,
    });
  } catch (error) {
    console.error("Create Donation Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function checkPaymentStatus(req, res) {
  try {
const { orderId } = req.query;
const merchantTransactionId=orderId;

  if (!merchantTransactionId) {
      return res.status(400).send("Missing orderId in callback");
    }
     let status = "pending";
    try {
      const orderStatusResponse = await phonePe.getOrderStatus(merchantTransactionId);
      if (orderStatusResponse?.state === "COMPLETED") status = "success";
      else if (orderStatusResponse?.state === "FAILED") status = "failed";
    } catch (err) {
      console.error("Error fetching PhonePe order status:", err.message);
    }
      // Update donation in DB
    


      const updatedMembership= await prisma.membershipPayment.update({
        where: { merchantOrderId: merchantTransactionId },
        data:{ status },
      });

      await prisma.payment.updateMany({
        where: { referenceId: merchantTransactionId },
        data: { status },
      });
      if (status === "success" && updatedMembership.email) {
              await sendMembershipThankYouEmail({
              name: updatedMembership.name,
              email: updatedMembership.email,
              amount: updatedMembership.amount,
              transactionId: updatedMembership.transactionId ,
              membershipType:updatedMembership.membershipType,
          });}
      return res.redirect(
      `${process.env.FRONTEND_URL}/magazine-status?status=${status}&txn=${merchantTransactionId}&amount=${updatedMembership.amount}`
    );
  } catch (err) {
    console.error("Magazine Payment Callback Error:", err.message);
    res.status(500).send("Callback handling failed");
  }
}

// ==================== AUTOPAY SUBSCRIPTION SETUP ====================

/**
 * Validate UPI VPA before subscription setup
 */
async function validateUpiVpa(req, res) {
  try {
    const { vpa } = req.body;

    if (!vpa) {
      return res.status(400).json({
        success: false,
        message: 'VPA is required',
      });
    }

    const authToken = await generateAuthToken();

    const response = await axios.post(
      `${getBaseUrl()}/v2/validate/upi`,
      {
        type: 'VPA',
        vpa: vpa,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        valid: response.data.valid,
        name: response.data.name || null,
      },
    });
  } catch (error) {
    console.error('Error validating VPA:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate VPA',
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Create Subscription Setup (UPI Intent or UPI Collect)
 */
async function createSubscriptionSetup(req, res) {
  try {
    const {
      userId,
      name,
      email,
      phone,
      address,
      city,
      state,
      vpa,
      pincode,
      membershipType,
  
      authWorkflowType = 'TRANSACTION', 
      amountType = 'FIXED', 
      frequency = 'YEARLY', 
      recurringCount = 10, 
      

    } = req.body;

    if (!name || !email || !phone || !vpa ) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, phone, amount, maxAmount, paymentMode',
      });
    }
    const amount=1100;

    if (authWorkflowType === 'TRANSACTION' && amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'For TRANSACTION flow, amount must be at least 100 paise (₹1)',
      });
    }

    const { merchantSubscriptionId, merchantOrderId, merchantUserId } = generateMerchantIds();
    const amountInPaise = Math.round(parseInt(amount));
    

    const authToken = await generateAuthToken();

    // Calculate subscription expiry (30 years from now by default)
    const subscriptionExpiry = Date.now() + (30 * 365 * 24 * 60 * 60 * 1000);
    const orderExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes
const paymentMode={ type: 'UPI_COLLECT', details: { type: 'VPA', vpa: vpa }};
    const subscriptionPayload = {
      merchantOrderId: merchantOrderId,
      amount: amountInPaise,
      expireAt: orderExpiry,
      paymentFlow: {
        type: 'SUBSCRIPTION_SETUP',
        merchantSubscriptionId: merchantSubscriptionId,
        authWorkflowType: authWorkflowType,
        amountType: amountType,
        maxAmount: amountInPaise,
        frequency: frequency,
        expireAt: subscriptionExpiry,
        paymentMode:paymentMode,
      },
     
    };

    console.log('Subscription Setup Payload:', JSON.stringify(subscriptionPayload, null, 2));

    const response = await axios.post(
      `${getBaseUrl()}/subscriptions/v2/setup`,
      subscriptionPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    console.log('PhonePe Response:', JSON.stringify(response.data, null, 2));

    const membership = await prisma.membershipPayment.create({
      data: {
        userId: userId || null,
        name: name,
        email: email,
        phone: phone,
        address: address || '',
        city: city || '',
        state: state || '',
        pincode: pincode || '',
        membershipType: membershipType,
        amount: amountInPaise,
        status: 'pending',
        transactionId: merchantOrderId,
        orderId: response.data.orderId || merchantOrderId,
        merchantOrderId: merchantOrderId,
        merchantSubscriptionId: merchantSubscriptionId,
        phonePeSubscriptionId: null, // Will be updated after completion
        subscriptionFrequency: frequency,
        recurringCount: recurringCount,
        amountType: amountType,
        authWorkflowType: authWorkflowType,
        subscriptionState: response.data.state || 'PENDING',
        paymentMethod: 'UPI_AUTOPAY',
        metadata: JSON.stringify({ 
          authToken: authToken,
          merchantUserId: userId ? userId.toString() : merchantUserId,
          paymentMode: paymentMode,
          maxAmount: amountInPaise,
        }),
      },
    });

    await prisma.payment.create({
      data: {
        userId: userId || null,
        referenceId: merchantSubscriptionId,
        provider: 'PHONEPE',
        amount: amount / 100,
        status: 'pending',
        type: 'subscription_setup',
        metadata: JSON.stringify({ membershipPaymentId: membership.id }),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription setup initiated',
      data: {
        membershipPaymentId: membership.id,
        merchantSubscriptionId: merchantSubscriptionId,
        merchantOrderId: merchantOrderId,
        orderId: response.data.orderId,
        state: response.data.state,
        intentUrl: response.data.intentUrl || null, // For UPI Intent
      },
    });
  } catch (error) {
    console.error('Error in subscription setup:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to create subscription setup',
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Get Subscription Order Status (for setup)
 */
async function getSubscriptionOrderStatus(req, res) {
  try {
    const { merchantOrderId } = req.params;

    const authToken = await generateAuthToken();

    const response = await axios.get(
      `${getBaseUrl()}/subscriptions/v2/order/${merchantOrderId}/status?details=true`,
      {
        headers: {
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    const membership = await prisma.membershipPayment.findFirst({
      where: { merchantOrderId: merchantOrderId },
    });

    if (membership) {
      const updateData = {
        subscriptionState: response.data.state,
        status: response.data.state === 'COMPLETED' ? 'active' : 
                response.data.state === 'FAILED' ? 'failed' : 
                'pending',
        orderId: response.data.orderId,
      };

      if (response.data.paymentFlow?.subscriptionId) {
        updateData.phonePeSubscriptionId = response.data.paymentFlow.subscriptionId;
      }

      if (response.data.paymentDetails && response.data.paymentDetails.length > 0) {
        const paymentDetail = response.data.paymentDetails[0];
        updateData.providerReferenceId = paymentDetail.transactionId;
        
        if (paymentDetail.errorCode) {
          updateData.payResponseCode = paymentDetail.errorCode;
        }
      }

      if (response.data.state === 'COMPLETED') {
        updateData.subscriptionStartDate = new Date();
        
        // Calculate next billing date based on frequency
        const nextBilling = new Date();
       nextBilling.setFullYear(nextBilling.getFullYear() + 1);
       updateData.nextBillingDate = nextBilling;
      }

    const updatedMembership=  await prisma.membershipPayment.update({
        where: { id: membership.id },
        data: updateData,
      });
 if (response.data.state  === "COMPLETED" && updatedMembership.email) {
              await sendMembershipThankYouEmail({
              name: updatedMembership.name,
              email: updatedMembership.email,
              amount: updatedMembership.amount,
              transactionId: updatedMembership.transactionId ,
              membershipType:updatedMembership.membershipType,
          });}
      // Update payment record
      await prisma.payment.updateMany({
        where: { referenceId: membership.merchantSubscriptionId },
        data: {
          status: response.data.state === 'COMPLETED' ? 'success' : 
                  response.data.state === 'FAILED' ? 'failed' : 
                  'pending',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('Error checking subscription order status:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check subscription order status',
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Get Subscription Status by Subscription ID
 */
async function getSubscriptionStatus(req, res) {
  try {
    const { merchantSubscriptionId } = req.params;

    const authToken = await generateAuthToken();

    const response = await axios.get(
      `${getBaseUrl()}/subscriptions/v2/${merchantSubscriptionId}/status?details=true`,
      {
        headers: {
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    const membership = await prisma.membershipPayment.findFirst({
      where: { merchantSubscriptionId: merchantSubscriptionId },
    });

    if (membership) {
      await prisma.membershipPayment.update({
        where: { id: membership.id },
        data: {
          subscriptionState: response.data.state,
          phonePeSubscriptionId: response.data.subscriptionId,
          status: response.data.state === 'ACTIVE' ? 'active' : 
                  response.data.state === 'CANCELLED' ? 'cancelled' : 
                  response.data.state === 'REVOKED' ? 'revoked' :
                  response.data.state === 'EXPIRED' ? 'expired' : 
                  response.data.state === 'PAUSED' ? 'paused' :
                  'pending',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('Error checking subscription status:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check subscription status',
      error: error.response?.data || error.message,
    });
  }
}

// ==================== RECURRING PAYMENT (REDEMPTION) ====================

/**
 * Notify Customer for Recurring Payment
 */
async function notifyRedemption(req, res) {
  try {
    const { membershipPaymentId, amount, redemptionRetryStrategy = 'STANDARD', autoDebit = false } = req.body;

    const membership = await prisma.membershipPayment.findUnique({
      where: { id: membershipPaymentId },
    });

    if (!membership || membership.subscriptionState !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or inactive subscription',
      });
    }

    const { merchantOrderId } = generateMerchantIds();
    const authToken = await generateAuthToken();

    // Use provided amount or default to membership amount
    const redemptionAmount = amount ? Math.round(parseInt(amount)) : membership.amount;

    // Expiry is 48 hours from now
    const expireAt = Date.now() + (48 * 60 * 60 * 1000);

    const notifyPayload = {
      merchantOrderId: merchantOrderId,
      amount: redemptionAmount,
      expireAt: expireAt,
      paymentFlow: {
        type: 'SUBSCRIPTION_REDEMPTION',
        merchantSubscriptionId: membership.merchantSubscriptionId,
        redemptionRetryStrategy: redemptionRetryStrategy,
        autoDebit: autoDebit,
      },
    };

    console.log('Redemption Notify Payload:', JSON.stringify(notifyPayload, null, 2));

    const response = await axios.post(
      `${getBaseUrl()}/subscriptions/v2/notify`,
      notifyPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    console.log('PhonePe Notify Response:', JSON.stringify(response.data, null, 2));

    const recurringPayment = await prisma.recurringPayment.create({
      data: {
        membershipPaymentId: membership.id,
        merchantOrderId: merchantOrderId,
        orderId: response.data.orderId,
        amount: redemptionAmount,
        status: 'PENDING',
        state: response.data.state || 'NOTIFICATION_IN_PROGRESS',
        dueDate: membership.nextBillingDate || new Date(),
        notifiedAt: new Date(),
        redemptionRetryStrategy: redemptionRetryStrategy,
        autoDebit: autoDebit,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Redemption notification sent',
      data: {
        recurringPaymentId: recurringPayment.id,
        merchantOrderId: merchantOrderId,
        orderId: response.data.orderId,
        state: response.data.state,
        expireAt: response.data.expireAt,
      },
    });
  } catch (error) {
    console.error('Error notifying redemption:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to notify redemption',
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Execute Recurring Payment (Redemption)
 */
async function executeRedemption(req, res) {
  try {
    const { recurringPaymentId } = req.body;

    const recurringPayment = await prisma.recurringPayment.findUnique({
      where: { id: recurringPaymentId },
      include: {
        membershipPayment: true,
      },
    });

    if (!recurringPayment) {
      return res.status(404).json({
        success: false,
        message: 'Recurring payment not found',
      });
    }

    const authToken = await generateAuthToken();

    const executePayload = {
      merchantOrderId: recurringPayment.merchantOrderId,
    };

    console.log('Redemption Execute Payload:', JSON.stringify(executePayload, null, 2));

    const response = await axios.post(
      `${getBaseUrl()}/subscriptions/v2/redeem`,
      executePayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    console.log('PhonePe Execute Response:', JSON.stringify(response.data, null, 2));

    await prisma.recurringPayment.update({
      where: { id: recurringPaymentId },
      data: {
        state: response.data.state || 'PENDING',
        providerReferenceId: response.data.transactionId || null,
        executedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Redemption executed',
      data: response.data,
    });
  } catch (error) {
    console.error('Error executing redemption:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to execute redemption',
      error: error.response?.data || error.message,
    });
  }
}

/**
 * Get Recurring Payment Status
 */
async function getRedemptionOrderStatus(req, res) {
  try {
    const { merchantOrderId } = req.params;

    const authToken = await generateAuthToken();

    const response = await axios.get(
      `${getBaseUrl()}/subscriptions/v2/order/${merchantOrderId}/status?details=true`,
      {
        headers: {
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    const recurringPayment = await prisma.recurringPayment.findFirst({
      where: { merchantOrderId: merchantOrderId },
    });

    if (recurringPayment) {
      const updateData = {
        state: response.data.state,
        status: response.data.state === 'COMPLETED' ? 'SUCCESS' : 
                response.data.state === 'FAILED' ? 'FAILED' : 
                'PENDING',
        orderId: response.data.orderId,
      };

      if (response.data.paymentDetails && response.data.paymentDetails.length > 0) {
        const paymentDetail = response.data.paymentDetails[0];
        updateData.providerReferenceId = paymentDetail.transactionId;
        
        if (paymentDetail.errorCode) {
          updateData.payResponseCode = paymentDetail.errorCode;
        }
      }

      if (response.data.state === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      await prisma.recurringPayment.update({
        where: { id: recurringPayment.id },
        data: updateData,
      });

      // Update next billing date if completed
      if (response.data.state === 'COMPLETED') {
        const membership = await prisma.membershipPayment.findUnique({
          where: { id: recurringPayment.membershipPaymentId },
        });

        if (membership) {
          const nextBilling = new Date(membership.nextBillingDate);
          
          switch (membership.subscriptionFrequency) {
            case 'DAILY':
              nextBilling.setDate(nextBilling.getDate() + 1);
              break;
            case 'WEEKLY':
              nextBilling.setDate(nextBilling.getDate() + 7);
              break;
            case 'FORTNIGHTLY':
              nextBilling.setDate(nextBilling.getDate() + 14);
              break;
            case 'MONTHLY':
              nextBilling.setMonth(nextBilling.getMonth() + 1);
              break;
            case 'BIMONTHLY':
              nextBilling.setMonth(nextBilling.getMonth() + 2);
              break;
            case 'QUARTERLY':
              nextBilling.setMonth(nextBilling.getMonth() + 3);
              break;
            case 'HALFYEARLY':
              nextBilling.setMonth(nextBilling.getMonth() + 6);
              break;
            case 'YEARLY':
              nextBilling.setFullYear(nextBilling.getFullYear() + 1);
              break;
          }

          await prisma.membershipPayment.update({
            where: { id: membership.id },
            data: { nextBillingDate: nextBilling },
          });

          // Create payment record for successful recurring payment
          await prisma.payment.create({
            data: {
              userId: membership.userId || null,
              referenceId: merchantOrderId,
              provider: 'PHONEPE',
              amount: recurringPayment.amount / 100,
              status: 'success',
              type: 'recurring_payment',
              metadata: JSON.stringify({ recurringPaymentId: recurringPayment.id }),
            },
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('Error checking redemption order status:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to check redemption order status',
      error: error.response?.data || error.message,
    });
  }
}

// ==================== SUBSCRIPTION MANAGEMENT ====================

/**
 * Cancel Subscription
 */
async function cancelSubscription(req, res) {
  try {
    const { merchantSubscriptionId } = req.params;

    const authToken = await generateAuthToken();

    const response = await axios.post(
      `${getBaseUrl()}/subscriptions/v2/${merchantSubscriptionId}/cancel`,
      {},
      {
        headers: {
          'Authorization': `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    await prisma.membershipPayment.updateMany({
      where: { merchantSubscriptionId: merchantSubscriptionId },
      data: {
        subscriptionState: 'CANCELLED',
        status: 'cancelled',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully',
      data: response.data,
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: error.response?.data || error.message,
    });
  }
}

// ==================== WEBHOOKS / CALLBACKS ====================

/**
 * Handle PhonePe Webhook Callback
 */
async function handleWebhook(req, res) {
  try {
    const { event, payload } = req.body;
   console.log('PhonePe Webhook Event:', event);
    // Validate webhook authentication (if configured)
    const authHeader = req.headers['authorization'];
    if (process.env.PHONEPE_WEBHOOK_USERNAME && process.env.PHONEPE_WEBHOOK_PASSWORD) {
      const expectedAuth = crypto
        .createHash('sha256')
        .update(`${process.env.PHONEPE_WEBHOOK_USERNAME}:${process.env.PHONEPE_WEBHOOK_PASSWORD}`)
        .digest('hex');
      
      if (authHeader !== expectedAuth) {
        console.error('Invalid webhook authentication');
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }
    }

    console.log('PhonePe Webhook Event: after verification ', event);
    console.log('PhonePe Webhook Payload:', JSON.stringify(payload, null, 2));

    // Route to appropriate handler based on event type
    if (event.includes('subscription.setup')) {
      await handleSubscriptionSetupWebhook(payload);
    } else if (event.includes('subscription.notification')) {
      await handleNotificationWebhook(payload);
    } else if (event.includes('subscription.redemption')) {
      await handleRedemptionWebhook(payload);
    } else if (event.includes('subscription.cancelled') || 
               event.includes('subscription.revoked') ||
               event.includes('subscription.paused') ||
               event.includes('subscription.unpaused')) {
      await handleSubscriptionStateChangeWebhook(payload);
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed',
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing webhook',
    });
  }
}

/**
 * Handle Subscription Setup Webhook
 */
async function handleSubscriptionSetupWebhook(payload) {
  const { merchantOrderId, state, paymentFlow, paymentDetails } = payload;

  const membership = await prisma.membershipPayment.findFirst({
    where: { merchantOrderId: merchantOrderId },
  });

  if (membership) {
    const updateData = {
      subscriptionState: state,
      status: state === 'COMPLETED' ? 'active' : 
              state === 'FAILED' ? 'failed' : 
              'pending',
      callbackData: JSON.stringify(payload),
    };

    if (paymentFlow?.subscriptionId) {
      updateData.phonePeSubscriptionId = paymentFlow.subscriptionId;
    }

    if (paymentDetails && paymentDetails.length > 0) {
      const paymentDetail = paymentDetails[0];
      updateData.providerReferenceId = paymentDetail.transactionId;
      
      if (paymentDetail.errorCode) {
        updateData.payResponseCode = paymentDetail.errorCode;
      }
    }

    if (state === 'COMPLETED') {
      updateData.subscriptionStartDate = new Date();
      
      const nextBilling = new Date();
      nextBilling.setFullYear(nextBilling.getFullYear() + 1);
         
      
      updateData.nextBillingDate = nextBilling;
    }

    await prisma.membershipPayment.update({
      where: { id: membership.id },
      data: updateData,
    });

    // Update payment record
    await prisma.payment.updateMany({
      where: { referenceId: membership.merchantSubscriptionId },
      data: {
        status: state === 'COMPLETED' ? 'success' : 
                state === 'FAILED' ? 'failed' : 
                'pending',
      },
    });
  }
}

/**
 * Handle Notification Webhook
 */
async function handleNotificationWebhook(payload) {
  const { merchantOrderId, state } = payload;

  const recurringPayment = await prisma.recurringPayment.findFirst({
    where: { merchantOrderId: merchantOrderId },
  });

  if (recurringPayment) {
    await prisma.recurringPayment.update({
      where: { id: recurringPayment.id },
      data: {
        state: state,
        callbackData: JSON.stringify(payload),
      },
    });
  }
}

/**
 * Handle Redemption Webhook
 */
async function handleRedemptionWebhook(payload) {
  const { merchantOrderId, state, paymentDetails } = payload;

  const recurringPayment = await prisma.recurringPayment.findFirst({
    where: { merchantOrderId: merchantOrderId },
  });

  if (recurringPayment) {
    const updateData = {
      state: state,
      status: state === 'COMPLETED' ? 'SUCCESS' : 
              state === 'FAILED' ? 'FAILED' : 
              'PENDING',
      callbackData: JSON.stringify(payload),
    };

    if (paymentDetails && paymentDetails.length > 0) {
      const paymentDetail = paymentDetails[0];
      updateData.providerReferenceId = paymentDetail.transactionId;
      
      if (paymentDetail.errorCode) {
        updateData.payResponseCode = paymentDetail.errorCode;
      }
    }

    if (state === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    await prisma.recurringPayment.update({
      where: { id: recurringPayment.id },
      data: updateData,
    });

    // Create payment record and update next billing date for successful payment
    if (state === 'COMPLETED') {
      const membership = await prisma.membershipPayment.findUnique({
        where: { id: recurringPayment.membershipPaymentId },
      });

      if (membership) {
        // Create payment record
        await prisma.payment.create({
          data: {
            userId: membership.userId || null,
            referenceId: merchantOrderId,
            provider: 'PHONEPE',
            amount: recurringPayment.amount / 100,
            status: 'success',
            type: 'recurring_payment',
            metadata: JSON.stringify({ recurringPaymentId: recurringPayment.id }),
          },
        });

        // Update next billing date
        const nextBilling = new Date(membership.nextBillingDate);
        switch (membership.subscriptionFrequency) {
          case 'DAILY':
            nextBilling.setDate(nextBilling.getDate() + 1);
            break;
          case 'WEEKLY':
            nextBilling.setDate(nextBilling.getDate() + 7);
            break;
          case 'FORTNIGHTLY':
            nextBilling.setDate(nextBilling.getDate() + 14);
            break;
          case 'MONTHLY':
            nextBilling.setMonth(nextBilling.getMonth() + 1);
            break;
          case 'BIMONTHLY':
            nextBilling.setMonth(nextBilling.getMonth() + 2);
            break;
          case 'QUARTERLY':
            nextBilling.setMonth(nextBilling.getMonth() + 3);
            break;
          case 'HALFYEARLY':
            nextBilling.setMonth(nextBilling.getMonth() + 6);
            break;
          case 'YEARLY':
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
            break;
        }

        await prisma.membershipPayment.update({
          where: { id: membership.id },
          data: { nextBillingDate: nextBilling },
        });
      }
    }
  }
}

/**
 * Handle Subscription State Change Webhook
 */
async function handleSubscriptionStateChangeWebhook(payload) {
  const { merchantSubscriptionId, state } = payload;

  await prisma.membershipPayment.updateMany({
    where: { merchantSubscriptionId: merchantSubscriptionId },
    data: {
      subscriptionState: state,
      status: state === 'ACTIVE' ? 'active' : 
              state === 'CANCELLED' ? 'cancelled' : 
              state === 'REVOKED' ? 'revoked' :
              state === 'PAUSED' ? 'paused' :
              'pending',
      callbackData: JSON.stringify(payload),
    },
  });
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Get all payments/subscriptions
 */
async function getAllPayments(req, res) {
  try {
    const { userId, email, phone } = req.query;

    const whereClause = {};
    
    if (userId) {
      whereClause.userId = parseInt(userId);
    }
    if (email) {
      whereClause.email = email;
    }
    if (phone) {
      whereClause.phone = phone;
    }

    const payments = await prisma.membershipPayment.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
    });
  }
}

/**
 * Get recurring payments for a subscription
 */
async function getSubscriptionRecurringPayments(req, res) {
  try {
    const { membershipPaymentId } = req.params;

    const recurringPayments = await prisma.recurringPayment.findMany({
      where: { membershipPaymentId: membershipPaymentId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: recurringPayments,
    });
  } catch (error) {
    console.error('Error fetching recurring payments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch recurring payments',
    });
  }
}

// ==================== EXPORTS ====================

export {
  // One-time payments
  initiateOneTimePayment,
  checkPaymentStatus,
  
  // VPA Validation
  validateUpiVpa,
  
  // Subscription Setup (AutoPay)
  createSubscriptionSetup,
  getSubscriptionOrderStatus,
  getSubscriptionStatus,
  
  // Recurring payments (Redemption)
  notifyRedemption,
  executeRedemption,
  getRedemptionOrderStatus,
  
  // Subscription management
  cancelSubscription,
  
  // Webhooks
  handleWebhook,
  
  // Helper functions
  getAllPayments,
  getSubscriptionRecurringPayments,
}