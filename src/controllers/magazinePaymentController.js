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
        membershipType:'lifetime',
        amount: amount,
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
      if (orderStatusResponse?.state === "COMPLETED") status = "active";
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
      if (status === "active" && updatedMembership.email) {
              await sendMembershipThankYouEmail({
              name: updatedMembership.name,
              email: updatedMembership.email,
              amount: updatedMembership.amount,
              transactionId: updatedMembership.transactionId ,
              membershipType:updatedMembership.membershipType,
          });}
      return res.redirect(
      `${process.env.FRONTEND_URL}/magazine-status?status=${updatedMembership.status}&txn=${merchantTransactionId}&amount=${updatedMembership.amount}`
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
        amount: amount,
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
        amount: amount,
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
          Authorization: `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    const membership = await prisma.membershipPayment.findFirst({
      where: { merchantOrderId },
    });

    if (membership) {
      const prevStatus = membership.status; // save old status

      const updateData = {
       
        status:
          response.data.state === "COMPLETED"
            ? "active"
            : response.data.state === "FAILED"
            ? "failed"
            : "pending",
        orderId: response.data.orderId,
         subscriptionState:  response.data.state === "COMPLETED"
            ? "ACTIVE"
            : response.data.state === "FAILED"
            ? "FAILED"
            : "PENDING",
      };

      if (response.data.paymentFlow?.subscriptionId) {
        updateData.phonePeSubscriptionId =
          response.data.paymentFlow.subscriptionId;
      }

      if (
        response.data.paymentDetails &&
        response.data.paymentDetails.length > 0
      ) {
        const paymentDetail = response.data.paymentDetails[0];
        updateData.providerReferenceId = paymentDetail.transactionId;

        if (paymentDetail.errorCode) {
          updateData.payResponseCode = paymentDetail.errorCode;
        }
      }

      // Handle completed subscription (only first time)
      if (response.data.state === "COMPLETED") {
        updateData.subscriptionStartDate = new Date();
        const nextBilling = new Date();
        nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        updateData.nextBillingDate = nextBilling;
      }

      const updatedMembership = await prisma.membershipPayment.update({
        where: { id: membership.id },
        data: updateData,
      });

      // Update related payment record
      await prisma.payment.updateMany({
        where: { referenceId: membership.merchantSubscriptionId },
        data: {
          status:
            response.data.state === "COMPLETED"
              ? "success"
              : response.data.state === "FAILED"
              ? "failed"
              : "pending",
        },
      });

      // ✅ Send thank-you email only once
      if (
        response.data.state === "COMPLETED" &&
        prevStatus !== "active" && // only if it was not already active
        updatedMembership.email
      ) {
        await sendMembershipThankYouEmail({
          name: updatedMembership.name,
          email: updatedMembership.email,
          amount: updatedMembership.amount,
          transactionId: updatedMembership.transactionId,
          membershipType: updatedMembership.membershipType,
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error checking subscription order status:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: "Failed to check subscription order status",
      error: error.response?.data || error.message,
    });
  }
}


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

async function cancelSubscription(req, res) {
  try {
    const { id } = req.params; // membershipPayment ID from frontend

    // 1️⃣ Find the membership payment record
    const membership = await prisma.membershipPayment.findUnique({
      where: { id: id },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Membership payment not found",
      });
    }

    if (!membership.merchantSubscriptionId) {
      return res.status(400).json({
        success: false,
        message: "No associated merchant subscription ID found for this membership",
      });
    }

    // 2️⃣ Generate PhonePe auth token
    const authToken = await generateAuthToken();

    // 3️⃣ Call PhonePe cancel API
    const response = await axios.post(
      `${getBaseUrl()}/subscriptions/v2/${membership.merchantSubscriptionId}/cancel`,
      {},
      {
        headers: {
          Authorization: `${authToken.tokenType} ${authToken.token}`,
        },
      }
    );

    // 4️⃣ Update membership record in DB
    const updatedMembership = await prisma.membershipPayment.update({
      where: { id: membership.id }, // ✅ FIXED here
      data: {
        subscriptionState: "CANCELLED",
        status: "cancelled",
      },
    });

    // 5️⃣ Optional: Update payment table
    await prisma.payment.updateMany({
      where: { referenceId: membership.merchantSubscriptionId },
      data: { status: "cancelled" },
    });

    return res.status(200).json({
      success: true,
      message: "Subscription cancelled successfully",
      data: {
        phonePeResponse: response.data,
        updatedMembership,
      },
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel subscription",
      error: error.response?.data || error.message,
    });
  }
}




async function getAllPayments(req, res) {
  try {
    const { name, status, email, membershipType, page = 1, limit = 10 } = req.query;

    const whereClause = {
      AND: [],
    };

    // Search by name OR email (MySQL is case-insensitive by default for LIKE)
    if (name || email) {
      const searchTerm = name || email;
      whereClause.AND.push({
        OR: [
          {
            name: {
              contains: searchTerm,
              // No mode needed for MySQL - it's case-insensitive by default
            },
          },
          {
            email: {
              contains: searchTerm,
              // No mode needed for MySQL
            },
          },
        ],
      });
    }

    // Filter by status
    if (status) {
      whereClause.AND.push({
        status: {
          equals: status,
        },
      });
    }

    // Filter by membership type
    if (membershipType) {
      whereClause.AND.push({
        membershipType: {
          equals: membershipType,
        },
      });
    }

    // Pagination
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    // Build the final where clause
    const finalWhereClause = whereClause.AND.length ? whereClause : undefined;

    // Total count
    const totalRecords = await prisma.membershipPayment.count({
      where: finalWhereClause,
    });

    // Paginated data
    const payments = await prisma.membershipPayment.findMany({
      where: finalWhereClause,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        totalRecords,
        currentPage: pageNumber,
        totalPages: Math.ceil(totalRecords / pageSize),
        pageSize,
      },
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
      error: error.message,
    });
  }
}

async function deleteSubscription(req, res) {
  try {
    const { id } = req.params; // membershipPayment ID from frontend

    // Check if the membership exists
    const membership = await prisma.membershipPayment.findUnique({
      where: { id: id },
    });

    if (!membership) {
      return res.status(404).json({
        success: false,
        message: "Membership payment not found",
      });
    }

    // Optionally delete related payment records
    if (membership.merchantSubscriptionId) {
      await prisma.payment.deleteMany({
        where: { referenceId: membership.merchantSubscriptionId },
      });
    }

    // Delete the membership payment record
    await prisma.membershipPayment.delete({
      where: { id: id },
    });

    return res.status(200).json({
      success: true,
      message: "Subscription deleted successfully",
      deletedId: id,
    });
  } catch (error) {
    console.error("Error deleting subscription:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete subscription",
      error: error.response?.data || error.message,
    });
  }
}


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

// ==================== Corn Job====================

/**
 * Automated Cron Job: Check all active subscriptions and update their status
 */
/**
 * Automated Cron Job: Check all active subscriptions and update their status
 */
async function checkAllSubscriptionStatuses() {
  try {
    console.log('🔄 Starting automated subscription status check...');

    // Get all memberships with active subscriptions (annual only)
    const activeSubscriptions = await prisma.membershipPayment.findMany({
      where: {
        membershipType: 'annual',
        merchantSubscriptionId: { not: null },
        subscriptionState: { in: ['ACTIVE', 'PENDING', 'CREATED'] },
      },
    });

    console.log(`📊 Found ${activeSubscriptions.length} active annual subscriptions to check`);

    const results = {
      checked: 0,
      updated: 0,
      errors: 0,
      notifications: [],
    };

    for (const membership of activeSubscriptions) {
      try {
        const authToken = await generateAuthToken();

        // Check subscription status with PhonePe
        const response = await axios.get(
          `${getBaseUrl()}/subscriptions/v2/${membership.merchantSubscriptionId}/status?details=true`,
          {
            headers: {
              'Authorization': `${authToken.tokenType} ${authToken.token}`,
            },
          }
        );

        results.checked++;

        // Map PhonePe state to our status
        const newStatus = response.data.state === 'ACTIVE' ? 'active' : 
                         response.data.state === 'CANCELLED' ? 'cancelled' : 
                         response.data.state === 'REVOKED' ? 'cancelled' :
                         response.data.state === 'EXPIRED' ? 'expired' : 
                         response.data.state === 'PAUSED' ? 'pending' :
                         response.data.state === 'COMPLETED' ? 'active' :
                         'pending';

        if (membership.status !== newStatus || membership.subscriptionState !== response.data.state) {
          await prisma.membershipPayment.update({
            where: { id: membership.id },
            data: {
              subscriptionState: response.data.state,
              phonePeSubscriptionId: response.data.subscriptionId || membership.phonePeSubscriptionId,
              status: newStatus,
            },
          });
          results.updated++;
          console.log(`✅ Updated subscription ${membership.merchantSubscriptionId}: ${newStatus}`);
        }

        // Check if billing is due (within 7 days for early warning)
        if (membership.nextBillingDate && response.data.state === 'ACTIVE') {
          const daysUntilBilling = Math.ceil(
            (new Date(membership.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilBilling <= 7 && daysUntilBilling >= 0) {
            results.notifications.push({
              membershipId: membership.id,
              daysUntilBilling,
              message: `Billing due in ${daysUntilBilling} days`,
            });
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.errors++;
        console.error(`❌ Error checking subscription ${membership.merchantSubscriptionId}:`, error.message);
      }
    }

    console.log('✅ Subscription status check completed:', results);
    return results;

  } catch (error) {
    console.error('❌ Error in automated subscription check:', error);
    throw error;
  }
}

/**
 * Automated Cron Job: Notify redemption for annual memberships due for billing
 * This sends the pre-debit notification 48-72 hours before billing date
 */
async function autoNotifyAnnualRedemptions() {
  try {
    console.log('🔔 Starting automated redemption notifications (24h+ advance notice)...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Notify 2-3 days before billing date (48-72 hours advance notice)
    const twoDaysFromNow = new Date(today);
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Find annual subscriptions due for billing in 2-3 days
    const dueSubscriptions = await prisma.membershipPayment.findMany({
      where: {
        membershipType: 'annual',
        subscriptionState: 'ACTIVE',
        status: 'active',
        nextBillingDate: {
          gte: twoDaysFromNow,
          lte: threeDaysFromNow,
        },
      },
    });

    console.log(`📊 Found ${dueSubscriptions.length} subscriptions due for billing in 2-3 days`);

    const results = {
      notified: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const membership of dueSubscriptions) {
      try {
        // Check if redemption already exists for this billing cycle
        const existingRedemption = await prisma.recurringPayment.findFirst({
          where: {
            membershipPaymentId: membership.id,
            dueDate: membership.nextBillingDate,
          },
        });

        if (existingRedemption) {
          results.skipped++;
          console.log(`⏭️ Skipping ${membership.merchantSubscriptionId} - redemption already exists`);
          continue;
        }

        // Create redemption notification
        const { merchantOrderId } = generateMerchantIds();
        const merchantRedemptionId = `REDEMP_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const authToken = await generateAuthToken();

        const expireAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days expiry

        const notifyPayload = {
          merchantOrderId: merchantOrderId,
          amount: Math.round(membership.amount * 100), // Convert to paise
          expireAt: expireAt,
          paymentFlow: {
            type: 'SUBSCRIPTION_REDEMPTION',
            merchantSubscriptionId: membership.merchantSubscriptionId,
            redemptionRetryStrategy: 'STANDARD',
            autoDebit: true,
          },
        };

        console.log(`📤 Sending pre-debit notification for ${membership.email} (billing in 2-3 days)`);

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

        // Create recurring payment record
        await prisma.recurringPayment.create({
          data: {
            membershipPaymentId: membership.id,
            merchantRedemptionId: merchantRedemptionId,
            merchantOrderId: merchantOrderId,
            amount: Math.round(membership.amount * 100),
            status: 'PENDING',
            state: response.data.state || 'ACCEPTED',
            dueDate: membership.nextBillingDate,
            notifiedAt: new Date(),
            metadata: JSON.stringify({
              orderId: response.data.orderId,
              expireAt: response.data.expireAt,
              redemptionRetryStrategy: 'STANDARD',
              autoDebit: true,
              notificationSentAt: new Date().toISOString(),
              billingDate: membership.nextBillingDate,
            }),
          },
        });


         await sendUpcomingChargeEmail({
          email: membership.email,
         name: membership.name,
           amount: membership.amount,
          billingDate: membership.nextBillingDate,
        });

        results.notified++;
        results.details.push({
          membershipId: membership.id,
          merchantRedemptionId,
          merchantOrderId,
          orderId: response.data.orderId,
          billingDate: membership.nextBillingDate,
          notificationSentAt: new Date(),
        });

        console.log(`✅ Notified redemption for ${membership.merchantSubscriptionId} - Billing on ${membership.nextBillingDate}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.errors++;
        console.error(`❌ Error notifying redemption for ${membership.merchantSubscriptionId}:`, error.response?.data || error.message);
      }
    }

    console.log('✅ Redemption notification completed:', results);
    return results;

  } catch (error) {
    console.error('❌ Error in automated redemption notification:', error);
    throw error;
  }
}

/**
 * Automated Cron Job: Auto-execute redemptions after 24+ hours of notification
 * This ensures compliance with the 24-hour pre-debit notification requirement
 */
async function autoExecuteRedemptions() {
  try {
    console.log('⚡ Starting automated redemption execution (24h+ after notification)...');

    // Find redemptions that are notified at least 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const readyRedemptions = await prisma.recurringPayment.findMany({
      where: {
        status: 'PENDING',
        state: { in: ['ACCEPTED', 'NOTIFICATION_IN_PROGRESS', 'NOTIFICATION_SENT'] },
        notifiedAt: {
          lte: twentyFourHoursAgo, // At least 24 hours since notification
        },
        executedAt: null, // Not yet executed
        dueDate: {
          lte: tomorrow, // Billing date is today or tomorrow
        },
      },
      include: {
        membershipPayment: true,
      },
    });

    console.log(`📊 Found ${readyRedemptions.length} redemptions ready for execution (24h+ after notification)`);

    const results = {
      executed: 0,
      skipped: 0,
      errors: 0,
      details: [],
    };

    for (const redemption of readyRedemptions) {
      try {
        // Double-check metadata for autoDebit
        let autoDebit = true;
        let notificationTime = null;
        try {
          const metadata = redemption.metadata ? JSON.parse(redemption.metadata) : {};
          autoDebit = metadata.autoDebit !== false;
          notificationTime = metadata.notificationSentAt;
        } catch (e) {
          console.log('Could not parse metadata, assuming autoDebit true');
        }

        if (!autoDebit) {
          results.skipped++;
          console.log(`⏭️ Skipping ${redemption.merchantOrderId} - autoDebit disabled`);
          continue;
        }

        // Calculate hours since notification
        const hoursSinceNotification = (new Date() - new Date(redemption.notifiedAt)) / (1000 * 60 * 60);
        
        if (hoursSinceNotification < 24) {
          results.skipped++;
          console.log(`⏭️ Skipping ${redemption.merchantOrderId} - only ${hoursSinceNotification.toFixed(1)} hours since notification (need 24+)`);
          continue;
        }

        const authToken = await generateAuthToken();

        const executePayload = {
          merchantOrderId: redemption.merchantOrderId,
        };

        console.log(`🔄 Executing redemption: ${redemption.merchantOrderId} (${hoursSinceNotification.toFixed(1)} hours after notification)`);

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

        // Update redemption record
        await prisma.recurringPayment.update({
          where: { id: redemption.id },
          data: {
            state: response.data.state || 'PENDING',
            providerReferenceId: response.data.transactionId || null,
            executedAt: new Date(),
            metadata: JSON.stringify({
              ...JSON.parse(redemption.metadata || '{}'),
              executedAt: new Date().toISOString(),
              hoursSinceNotification: hoursSinceNotification.toFixed(2),
            }),
          },
        });

        results.executed++;
        results.details.push({
          redemptionId: redemption.id,
          merchantOrderId: redemption.merchantOrderId,
          state: response.data.state,
          transactionId: response.data.transactionId,
          hoursSinceNotification: hoursSinceNotification.toFixed(2),
        });

        console.log(`✅ Executed redemption: ${redemption.merchantOrderId}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.errors++;
        console.error(`❌ Error executing redemption ${redemption.merchantOrderId}:`, error.response?.data || error.message);
        
        // Mark as error in database
        await prisma.recurringPayment.update({
          where: { id: redemption.id },
          data: {
            state: 'FAILED',
            status: 'FAILED',
            payResponseCode: error.response?.data?.code || 'EXECUTION_ERROR',
            executedAt: new Date(),
          },
        });
      }
    }

    console.log('✅ Redemption execution completed:', results);
    return results;

  } catch (error) {
    console.error('❌ Error in automated redemption execution:', error);
    throw error;
  }
}

/**
 * Automated Cron Job: Check all pending redemption payment statuses
 */
async function checkAllRedemptionStatuses() {
  try {
    console.log('🔄 Starting automated redemption status check...');

    // Get all pending redemption payments that have been executed
    const pendingRedemptions = await prisma.recurringPayment.findMany({
      where: {
        status: { in: ['PENDING'] },
        executedAt: { not: null }, // Only check executed ones
      },
      include: {
        membershipPayment: true,
      },
    });

    console.log(`📊 Found ${pendingRedemptions.length} pending redemptions to check`);

    const results = {
      checked: 0,
      completed: 0,
      failed: 0,
      errors: 0,
    };

    for (const redemption of pendingRedemptions) {
      try {
        const authToken = await generateAuthToken();

        // Check redemption order status
        const response = await axios.get(
          `${getBaseUrl()}/subscriptions/v2/order/${redemption.merchantOrderId}/status?details=true`,
          {
            headers: {
              'Authorization': `${authToken.tokenType} ${authToken.token}`,
            },
          }
        );

        results.checked++;

        const updateData = {
          state: response.data.state,
          status: response.data.state === 'COMPLETED' ? 'SUCCESS' : 
                  response.data.state === 'FAILED' ? 'FAILED' : 
                  'PENDING',
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
          results.completed++;
          
          // Update next billing date
          const membership = redemption.membershipPayment;
          const nextBilling = new Date(membership.nextBillingDate);
          
          // For annual subscriptions, add 1 year
          if (membership.subscriptionFrequency === 'YEARLY') {
            nextBilling.setFullYear(nextBilling.getFullYear() + 1);
          }

          await prisma.membershipPayment.update({
            where: { id: membership.id },
            data: { nextBillingDate: nextBilling },
          });

          // Create payment record
          await prisma.payment.create({
            data: {
              userId: membership.userId || null,
              referenceId: redemption.merchantOrderId,
              provider: 'PHONEPE',
              amount: redemption.amount / 100, // Convert paise to rupees
              status: 'success',
              type: 'recurring_payment',
              metadata: JSON.stringify({ 
                recurringPaymentId: redemption.id,
                membershipPaymentId: membership.id,
                subscriptionId: membership.merchantSubscriptionId,
              }),
            },
          });

          console.log(`✅ Redemption completed: ${redemption.merchantOrderId} - Next billing: ${nextBilling}`);
        } else if (response.data.state === 'FAILED') {
          results.failed++;
          console.log(`❌ Redemption failed: ${redemption.merchantOrderId}`);
        }

        await prisma.recurringPayment.update({
          where: { id: redemption.id },
          data: updateData,
        });

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.errors++;
        console.error(`❌ Error checking redemption ${redemption.merchantOrderId}:`, error.message);
      }
    }

    console.log('✅ Redemption status check completed:', results);
    return results;

  } catch (error) {
    console.error('❌ Error in automated redemption check:', error);
    throw error;
  }
}

/**
 * Combined: Check redemption statuses and auto-execute if needed
 */
async function checkAndExecuteRedemptions() {
  try {
    console.log('🔄 Starting redemption check and execution...');

    const results = {
      timestamp: new Date().toISOString(),
      statusCheck: null,
      autoExecution: null,
    };

    // 1. First, check status of all pending redemptions
    results.statusCheck = await checkAllRedemptionStatuses();

    // 2. Then, auto-execute ready redemptions (24h+ after notification)
    results.autoExecution = await autoExecuteRedemptions();

    console.log('✅ Redemption check and execution completed');
    return results;

  } catch (error) {
    console.error('❌ Error in redemption check and execution:', error);
    throw error;
  }
}

/**
 * Master Cron Job: Run all automated checks including execution
 */
async function runAllAutomatedChecks(req, res) {
  try {
    console.log('🚀 Starting all automated checks...');

    const results = {
      timestamp: new Date().toISOString(),
      subscriptionCheck: null,
      redemptionNotifications: null,
      redemptionCheckAndExecute: null,
    };

    // 1. Check all subscription statuses
    console.log('1️⃣ Checking subscription statuses...');
    results.subscriptionCheck = await checkAllSubscriptionStatuses();

    // 2. Notify redemptions for due annual memberships (2-3 days in advance)
    console.log('2️⃣ Notifying redemptions (48-72h advance notice)...');
    results.redemptionNotifications = await autoNotifyAnnualRedemptions();

    // 3. Check redemption statuses and auto-execute (24h+ after notification)
    console.log('3️⃣ Checking and executing redemptions (24h+ after notification)...');
    results.redemptionCheckAndExecute = await checkAndExecuteRedemptions();

    console.log('✅ All automated checks completed successfully');

    if (res) {
      return res.status(200).json({
        success: true,
        message: 'All automated checks completed',
        data: results,
      });
    }

    return results;

  } catch (error) {
    console.error('❌ Error in automated checks:', error);
    
    if (res) {
      return res.status(500).json({
        success: false,
        message: 'Error running automated checks',
        error: error.message,
      });
    }

    throw error;
  }
}


























export {
  
  initiateOneTimePayment,
  checkPaymentStatus,
  deleteSubscription,
  

  validateUpiVpa,
  

  createSubscriptionSetup,
  getSubscriptionOrderStatus,
  getSubscriptionStatus,
  

  notifyRedemption,
  executeRedemption,
  getRedemptionOrderStatus,
  

  cancelSubscription,
  


  getAllPayments,
  getSubscriptionRecurringPayments,





  checkAllSubscriptionStatuses,
  autoNotifyAnnualRedemptions,
  checkAllRedemptionStatuses,
  autoExecuteRedemptions,
  checkAndExecuteRedemptions,
  runAllAutomatedChecks,
}