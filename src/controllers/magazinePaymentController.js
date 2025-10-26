import dotenv from "dotenv";
import crypto from "crypto";
import axios from "axios";
import { randomUUID } from "crypto";
import { prisma } from "../prisma/config.js";

dotenv.config();

// PhonePe AutoPay Configuration
const PHONEPE_BASE_URL = process.env.NODE_ENV === "production"
  ? "https://api.phonepe.com/apis/pg"
  : "https://api-preprod.phonepe.com/apis/pg-sandbox";

const PHONEPE_MERCHANT_ID = process.env.PHONEPE_MERCHANT_ID;
const PHONEPE_CLIENT_ID = process.env.PHONEPE_CLIENT_ID;
const PHONEPE_CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET;
const PHONEPE_CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || "1";

// Token cache
let authToken = null;
let tokenExpiresAt = null;

/**
 * Get or refresh PhonePe OAuth token
 */
const getAuthToken = async () => {
  try {
    // Check if token is valid (refresh 5 minutes before expiry)
    const currentTime = Math.floor(Date.now() / 1000);
    if (authToken && tokenExpiresAt && currentTime < tokenExpiresAt - 300) {
      return authToken;
    }

    // Request new token
    const tokenUrl = `${PHONEPE_BASE_URL}/v1/oauth/token`;
    const params = new URLSearchParams({
      client_id: PHONEPE_CLIENT_ID,
      client_version: PHONEPE_CLIENT_VERSION,
      client_secret: PHONEPE_CLIENT_SECRET,
      grant_type: "client_credentials",
    });

    const response = await axios.post(tokenUrl, params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    authToken = response.data.access_token;
    tokenExpiresAt = response.data.expires_at;

    console.log("PhonePe OAuth token obtained successfully");
    return authToken;
  } catch (error) {
    console.error("Error getting auth token:", error.response?.data || error.message);
    throw new Error("Failed to get authorization token");
  }
};

/**
 * Create Subscription Setup (AutoPay Mandate)
 * POST /api/autopay/subscription/create
 */
export const createSubscription = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      city,
      state,
      pincode,
      membershipType,
      amount,
      frequency = "MONTHLY", // DAILY, WEEKLY, MONTHLY, QUARTERLY, HALF_YEARLY, YEARLY, ON_DEMAND
      recurringCount, // Optional: number of times to recur
      description,
    } = req.body;

    const userId = req.user?.id;

    // Validation
    if (!name || !email || !phone || !membershipType || !amount) {
      return res.status(400).json({ message: "सभी फ़ील्ड आवश्यक हैं।" });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: "राशि शून्य से अधिक होनी चाहिए।" });
    }

    // Get OAuth token
    const token = await getAuthToken();

    // Generate unique IDs
    const merchantSubscriptionId = `SUB_${randomUUID()}`;
    const merchantUserId = userId ? `USER_${userId}` : `GUEST_${randomUUID()}`;
    const merchantOrderId = `ORD_${randomUUID()}`;

    // Convert to paise (smallest currency unit)
    const amountInPaisa = Math.round(amount * 100);

    // Calculate expiry (1 year from now)
    const expireAt = Date.now() + (365 * 24 * 60 * 60 * 1000);

    // Prepare PhonePe API payload
    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantSubscriptionId,
      merchantUserId,
      merchantOrderId,
      subscriptionName: `${membershipType} Membership`,
      authWorkflowType: "TRANSACTION", // TRANSACTION or MANDATE
      amountType: "FIXED", // FIXED or VARIABLE
      amount: amountInPaisa,
      frequency,
      recurringCount: recurringCount || null,
      description: description || `${membershipType} Membership Payment`,
      mobileNumber: phone,
      expireAt,
      billingCycle: {
        interval: 1,
        intervalType: frequency,
      },
      metaInfo: {
        name,
        email,
        address: address ? `${address}, ${city}, ${state} - ${pincode}` : undefined,
      },
    };

    // Make API call to PhonePe
    const setupUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/setup`;
    const response = await axios.post(setupUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const { subscriptionId,  redirectInfo } = response.data.data;

    // Save to MembershipPayment table (reusing existing structure)
    await prisma.membershipPayment.create({
      data: {
        userId: userId || 0, // Use 0 for guest users
        name,
        email,
        phone,
        address: address || "",
        city: city || "",
        state: state || "",
        pincode: pincode || "",
        membershipType,
        amount: Math.round(amount), // Store as Int
        status: "pending",
        transactionId: merchantSubscriptionId, // Store subscription ID here
        paymentMethod: "phonepe_autopay",
      },
    });

    console.log(`Subscription created: ${merchantSubscriptionId}`);

    return res.status(200).json({
      success: true,
      message: "सदस्यता सफलतापूर्वक बनाई गई",
      data: {
        subscriptionId,
        merchantSubscriptionId,
        merchantOrderId,
        redirectUrl: redirectInfo?.url || null,
        state,
        frequency,
        amount: amountInPaisa,
      },
    });
  } catch (error) {
    console.error("Create Subscription Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "सदस्यता बनाने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Check Subscription Order Status
 * GET /api/autopay/subscription/order/:merchantOrderId/status
 */
export const checkSubscriptionOrderStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      return res.status(400).json({ message: "Order ID आवश्यक है" });
    }

    const token = await getAuthToken();
    const statusUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/order/${merchantOrderId}/status`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const { state, subscriptionId, merchantSubscriptionId } = response.data.data;

    // Update membership payment status if setup is completed
    if (state === "COMPLETED" && merchantSubscriptionId) {
      await prisma.membershipPayment.updateMany({
        where: { transactionId: merchantSubscriptionId },
        data: { status: "success" },
      });
      console.log(`Subscription setup completed: ${merchantSubscriptionId}`);
    } else if (state === "FAILED" && merchantSubscriptionId) {
      await prisma.membershipPayment.updateMany({
        where: { transactionId: merchantSubscriptionId },
        data: { status: "failed" },
      });
      console.log(`Subscription setup failed: ${merchantSubscriptionId}`);
    }

    return res.status(200).json({
      success: true,
      data: response.data.data,
    });
  } catch (error) {
    console.error("Check Order Status Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "स्थिति जांचने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Get Subscription Status
 * GET /api/autopay/subscription/:merchantSubscriptionId/status
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const { merchantSubscriptionId } = req.params;

    if (!merchantSubscriptionId) {
      return res.status(400).json({ message: "Subscription ID आवश्यक है" });
    }

    const token = await getAuthToken();
    const statusUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/${merchantSubscriptionId}/status`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const { state } = response.data.data;

    // Update status based on PhonePe response
    let dbStatus = "pending";
    if (state === "ACTIVE") dbStatus = "success";
    else if (state === "CANCELLED" || state === "FAILED") dbStatus = "failed";
    else if (state === "PAUSED") dbStatus = "paused";

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: dbStatus },
    });

    return res.status(200).json({
      success: true,
      data: response.data.data,
    });
  } catch (error) {
    console.error("Get Subscription Status Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "सदस्यता स्थिति प्राप्त करने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Notify Customer before Redemption (Pre-debit notification)
 * POST /api/autopay/subscription/notify
 * Admin Only
 */
export const notifyRedemption = async (req, res) => {
  try {
    const { merchantSubscriptionId, amount, dueDate, description } = req.body;

    if (!merchantSubscriptionId || !amount) {
      return res.status(400).json({ message: "आवश्यक फ़ील्ड गायब हैं" });
    }

    const token = await getAuthToken();
    const amountInPaisa = Math.round(amount * 100);

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantSubscriptionId,
      amount: amountInPaisa,
      dueDate: dueDate || Date.now() + (24 * 60 * 60 * 1000), // Default: tomorrow
      description: description || "आगामी भुगतान अधिसूचना",
    };

    const notifyUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/notify`;
    const response = await axios.post(notifyUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`Pre-debit notification sent for: ${merchantSubscriptionId}`);

    return res.status(200).json({
      success: true,
      message: "सूचना सफलतापूर्वक भेजी गई",
      data: response.data,
    });
  } catch (error) {
    console.error("Notify Redemption Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "सूचना भेजने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Execute Redemption (Charge customer)
 * POST /api/autopay/subscription/redeem
 * Admin Only
 */
export const executeRedemption = async (req, res) => {
  try {
    const { merchantSubscriptionId, amount, description } = req.body;

    if (!merchantSubscriptionId || !amount) {
      return res.status(400).json({ message: "आवश्यक फ़ील्ड गायब हैं" });
    }

    const token = await getAuthToken();
    const merchantOrderId = `ORD_${randomUUID()}`;
    const amountInPaisa = Math.round(amount * 100);

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantSubscriptionId,
      merchantOrderId,
      amount: amountInPaisa,
      description: description || "सदस्यता भुगतान",
    };

    const redeemUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/redeem`;
    const response = await axios.post(redeemUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const { orderId, state } = response.data.data;

    // Log this as a separate payment in Payment table
    const subscription = await prisma.membershipPayment.findFirst({
      where: { transactionId: merchantSubscriptionId },
    });

    if (subscription) {
      await prisma.payment.create({
        data: {
          userId: subscription.userId,
          referenceId: merchantOrderId,
          provider: "phonepe_autopay",
          amount: amount,
          status: state === "COMPLETED" ? "success" : "pending",
        },
      });
      console.log(`Redemption initiated: ${merchantOrderId} for ${merchantSubscriptionId}`);
    }

    return res.status(200).json({
      success: true,
      message: "भुगतान सफलतापूर्वक शुरू किया गया",
      data: {
        merchantOrderId,
        orderId,
        state,
      },
    });
  } catch (error) {
    console.error("Execute Redemption Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "भुगतान शुरू करने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Cancel Subscription
 * POST /api/autopay/subscription/:merchantSubscriptionId/cancel
 */
export const cancelSubscription = async (req, res) => {
  try {
    const { merchantSubscriptionId } = req.params;

    if (!merchantSubscriptionId) {
      return res.status(400).json({ message: "Subscription ID आवश्यक है" });
    }

    const token = await getAuthToken();

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantSubscriptionId,
    };

    const cancelUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/${merchantSubscriptionId}/cancel`;
    const response = await axios.post(cancelUrl, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    // Update subscription status in database
    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "cancelled" },
    });

    console.log(`Subscription cancelled: ${merchantSubscriptionId}`);

    return res.status(200).json({
      success: true,
      message: "सदस्यता सफलतापूर्वक रद्द की गई",
      data: response.data,
    });
  } catch (error) {
    console.error("Cancel Subscription Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "सदस्यता रद्द करने में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Subscription Webhook Handler
 * POST /api/autopay/webhook
 */
export const subscriptionWebhook = async (req, res) => {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    
    if (!authHeader) {
      console.error("Webhook: Missing Authorization header");
      return res.status(400).json({ message: "Missing Authorization header" });
    }

    // Validate webhook authorization (Basic Auth)
    const webhookUsername = process.env.PHONEPE_WEBHOOK_USERNAME;
    const webhookPassword = process.env.PHONEPE_WEBHOOK_PASSWORD;
    const expectedAuth = `Basic ${Buffer.from(`${webhookUsername}:${webhookPassword}`).toString('base64')}`;

    if (authHeader !== expectedAuth) {
      console.error("Webhook: Invalid authorization");
      return res.status(401).json({ message: "Unauthorized" });
    }

    const payload = req.body;
    console.log("Subscription Webhook Received:", JSON.stringify(payload, null, 2));

    const { event, payload: eventPayload } = payload;

    // Handle different webhook events
    switch (event) {
      case "subscription.setup.order.completed":
        await handleSetupCompleted(eventPayload);
        break;

      case "subscription.setup.order.failed":
        await handleSetupFailed(eventPayload);
        break;

      case "subscription.redemption.order.completed":
        await handleRedemptionCompleted(eventPayload);
        break;

      case "subscription.redemption.order.failed":
        await handleRedemptionFailed(eventPayload);
        break;

      case "SUBSCRIPTION_PAUSED":
        await handleSubscriptionPaused(eventPayload);
        break;

      case "SUBSCRIPTION_UNPAUSED":
        await handleSubscriptionUnpaused(eventPayload);
        break;

      case "SUBSCRIPTION_CANCELLED":
        await handleSubscriptionCancelled(eventPayload);
        break;

      default:
        console.log("Unhandled webhook event:", event);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook Error:", error.message);
    return res.status(500).send("Webhook processing failed");
  }
};

// ==================== Webhook Event Handlers ====================

const handleSetupCompleted = async (payload) => {
  try {
    const { merchantSubscriptionId } = payload;

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "success" },
    });

    console.log(`✅ Subscription setup completed: ${merchantSubscriptionId}`);
  } catch (error) {
    console.error("Error handling setup completed:", error.message);
  }
};

const handleSetupFailed = async (payload) => {
  try {
    const { merchantSubscriptionId } = payload;

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "failed" },
    });

    console.log(`❌ Subscription setup failed: ${merchantSubscriptionId}`);
  } catch (error) {
    console.error("Error handling setup failed:", error.message);
  }
};

const handleRedemptionCompleted = async (payload) => {
  try {
    const { merchantOrderId, merchantSubscriptionId, amount } = payload;

    // Find subscription
    const subscription = await prisma.membershipPayment.findFirst({
      where: { transactionId: merchantSubscriptionId },
    });

    if (subscription) {
      // Log successful payment
      await prisma.payment.create({
        data: {
          userId: subscription.userId,
          referenceId: merchantOrderId,
          provider: "phonepe_autopay",
          amount: amount ? amount / 100 : subscription.amount,
          status: "success",
        },
      });
      console.log(`✅ Redemption completed: ${merchantOrderId}`);
    }
  } catch (error) {
    console.error("Error handling redemption completed:", error.message);
  }
};

const handleRedemptionFailed = async (payload) => {
  try {
    const { merchantOrderId, merchantSubscriptionId } = payload;

    const subscription = await prisma.membershipPayment.findFirst({
      where: { transactionId: merchantSubscriptionId },
    });

    if (subscription) {
      await prisma.payment.create({
        data: {
          userId: subscription.userId,
          referenceId: merchantOrderId,
          provider: "phonepe_autopay",
          amount: subscription.amount,
          status: "failed",
        },
      });
      console.log(`❌ Redemption failed: ${merchantOrderId}`);
    }
  } catch (error) {
    console.error("Error handling redemption failed:", error.message);
  }
};

const handleSubscriptionPaused = async (payload) => {
  try {
    const { merchantSubscriptionId } = payload;

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "paused" },
    });

    console.log(`⏸️ Subscription paused: ${merchantSubscriptionId}`);
  } catch (error) {
    console.error("Error handling subscription paused:", error.message);
  }
};

const handleSubscriptionUnpaused = async (payload) => {
  try {
    const { merchantSubscriptionId } = payload;

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "success" },
    });

    console.log(`▶️ Subscription unpaused: ${merchantSubscriptionId}`);
  } catch (error) {
    console.error("Error handling subscription unpaused:", error.message);
  }
};

const handleSubscriptionCancelled = async (payload) => {
  try {
    const { merchantSubscriptionId } = payload;

    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { status: "cancelled" },
    });

    console.log(`🚫 Subscription cancelled: ${merchantSubscriptionId}`);
  } catch (error) {
    console.error("Error handling subscription cancelled:", error.message);
  }
};

// ==================== Admin & User Query Functions ====================

/**
 * Get All Subscriptions (Admin)
 * GET /api/autopay/admin/subscriptions
 */
export const getAllSubscriptions = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status = "" } = req.query;

    const pageNum = parseInt(page, 10);
    const pageSize = parseInt(limit, 10);
    const skip = (pageNum - 1) * pageSize;

    const filters = {
      paymentMethod: "phonepe_autopay", // Filter only autopay subscriptions
    };

    if (status) {
      filters.status = status;
    }

    if (search) {
      filters.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { membershipType: { contains: search } },
        { transactionId: { contains: search } },
      ];
    }

    const total = await prisma.membershipPayment.count({ where: filters });

    const subscriptions = await prisma.membershipPayment.findMany({
      where: filters,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    });

    return res.status(200).json({
      success: true,
      data: subscriptions,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Get Subscriptions Error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get User's Subscriptions
 * GET /api/autopay/user/subscriptions
 */
export const getUserSubscriptions = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const subscriptions = await prisma.membershipPayment.findMany({
      where: { 
        userId,
        paymentMethod: "phonepe_autopay"
      },
      orderBy: { createdAt: "desc" },
    });

    // Get payment history for each subscription
    const subscriptionsWithPayments = await Promise.all(
      subscriptions.map(async (sub) => {
        const payments = await prisma.payment.findMany({
          where: {
            userId,
            provider: "phonepe_autopay",
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        });

        return {
          ...sub,
          paymentHistory: payments,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: subscriptionsWithPayments,
    });
  } catch (error) {
    console.error("Get User Subscriptions Error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Get Subscription Details by ID
 * GET /api/autopay/subscription/:id
 */
export const getSubscriptionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const subscription = await prisma.membershipPayment.findUnique({
      where: { id },
    });

    if (!subscription) {
      return res.status(404).json({ message: "सदस्यता नहीं मिली" });
    }

    // Check if user owns this subscription (unless admin)
    if (userRole !== "admin" && subscription.userId !== userId) {
      return res.status(403).json({ message: "अनधिकृत पहुंच" });
    }

    // Get payment history
    const payments = await prisma.payment.findMany({
      where: {
        userId: subscription.userId,
        provider: "phonepe_autopay",
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: {
        ...subscription,
        paymentHistory: payments,
      },
    });
  } catch (error) {
    console.error("Get Subscription By ID Error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

