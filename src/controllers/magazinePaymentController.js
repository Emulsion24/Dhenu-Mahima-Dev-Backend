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
    const currentTime = Math.floor(Date.now() / 1000);
    if (authToken && tokenExpiresAt && currentTime < tokenExpiresAt - 300) {
      return authToken;
    }

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
      state: userState,
      pincode,
      membershipType,
      amount,
      frequency = "MONTHLY",
      vpa,
      paymentMode,
    } = req.body;

    const userId = req.user?.id;

    // Validation
    if (!name || !email || !phone || !membershipType || !amount) {
      return res.status(400).json({ message: "सभी फ़ील्ड आवश्यक हैं।" });
    }

    if (amount <= 0) {
      return res.status(400).json({ message: "राशि शून्य से अधिक होनी चाहिए।" });
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Failed to obtain OAuth token");
    }

    // Generate unique IDs
    const timestamp = Date.now();
    const merchantSubscriptionId = `SUB_${timestamp}_${randomUUID().substring(0, 8)}`;
    const merchantOrderId = `ORD_${timestamp}_${randomUUID().substring(0, 8)}`;
    const amountInPaisa = Math.round(amount * 100);

    const expireAt = Date.now() + (30 * 60 * 1000);
    const subscriptionExpireAt = Date.now() + (365 * 24 * 60 * 60 * 1000);

    // Determine device and payment mode
    const userAgent = req.headers['user-agent'] || '';
    const isAndroid = /Android/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    
    let deviceOS = null;
    let selectedPaymentMode = paymentMode || "UPI_COLLECT";
    
    if (isAndroid) {
      deviceOS = "ANDROID";
      selectedPaymentMode = "UPI_INTENT";
    } else if (isIOS) {
      deviceOS = "IOS";
      selectedPaymentMode = "UPI_INTENT";
    }

    // Build payment mode object
    let paymentModeObj;
    
    if (selectedPaymentMode === "UPI_COLLECT" && vpa) {
      paymentModeObj = {
        type: "UPI_COLLECT",
        details: {
          type: "VPA",
          vpa: vpa,
        },
      };
    } else if (selectedPaymentMode === "UPI_INTENT") {
      const targetApp = isAndroid ? "com.phonepe.app" : "PHONEPE";
      paymentModeObj = {
        type: "UPI_INTENT",
        targetApp: targetApp,
      };
    } else {
      return res.status(400).json({
        message: "कृपया अपना UPI ID दर्ज करें या PhonePe ऐप का उपयोग करें।",
        requiresVPA: true,
      });
    }

    const payload = {
      merchantOrderId,
      amount: amountInPaisa,
      expireAt,
      metaInfo: {
        udf1: name,
        udf2: email,
        udf3: phone,
        udf4: membershipType,
        udf5: address ? `${address}, ${city}, ${userState} - ${pincode}` : "",
      },
      paymentFlow: {
        type: "SUBSCRIPTION_SETUP",
        merchantSubscriptionId,
        authWorkflowType: "TRANSACTION",
        amountType: "FIXED",
        maxAmount: amountInPaisa,
        frequency,
        expireAt: subscriptionExpireAt,
        paymentMode: paymentModeObj,
      },
    };

    if (deviceOS) {
      payload.deviceContext = {
        deviceOS,
      };
    }

    console.log("PhonePe Subscription Payload:", JSON.stringify(payload, null, 2));

    const setupUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/setup`;
    
    const response = await axios.post(setupUrl, payload, {
      headers: {
        Authorization: `O-Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      validateStatus: (status) => status < 600,
    });

    console.log("PhonePe Response:", JSON.stringify(response.data, null, 2));

    if (response.status !== 200 || !response.data.orderId) {
      throw new Error(`PhonePe API Error: ${JSON.stringify(response.data)}`);
    }

    const { orderId, state, intentUrl } = response.data;

    // Save to database with proper ID mapping
    const metadataObj = {
      frequency,
      deviceOS: deviceOS || "WEB",
      paymentMode: selectedPaymentMode,
      amountInPaisa,
    };

    await prisma.membershipPayment.create({
      data: {
        id: randomUUID(), // Generate UUID for primary key
        userId: userId || 0,
        name,
        email,
        phone,
        address: address || "",
        city: city || "",
        state: userState || "",
        pincode: pincode || "",
        membershipType,
        amount: Math.round(amount),
        status: "pending",
        transactionId: merchantSubscriptionId, // Our subscription ID
        orderId: merchantOrderId, // Our order ID
        phonePeOrderId: orderId, // PhonePe's order ID
        paymentMethod: "phonepe_autopay",
        metadata: JSON.stringify(metadataObj),
      },
    });

    console.log(`Subscription created:`, {
      dbId: randomUUID(),
      merchantSubscriptionId,
      merchantOrderId,
      phonePeOrderId: orderId,
    });

    const responseData = {
      orderId,
      merchantSubscriptionId,
      merchantOrderId,
      orderState: state,
      paymentMode: selectedPaymentMode,
      frequency,
      amount: amountInPaisa,
      deviceOS: deviceOS || "WEB",
    };

    if (selectedPaymentMode === "UPI_INTENT" && intentUrl) {
      responseData.intentUrl = intentUrl;
      responseData.redirectRequired = true;
    } else if (selectedPaymentMode === "UPI_COLLECT") {
      responseData.pollRequired = true;
      responseData.pollInterval = 3000;
      responseData.message = "कृपया अपने UPI ऐप में भुगतान अनुरोध स्वीकार करें";
    }

    return res.status(200).json({
      success: true,
      message: "सदस्यता सेटअप शुरू किया गया",
      data: responseData,
    });
  } catch (error) {
    console.error("Create Subscription Error:", error.response?.data || error.message);
    
    if (error.response) {
      console.error("Response Status:", error.response.status);
      console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
    }
    
    return res.status(500).json({
      message: "सदस्यता बनाने में त्रुटि",
      error: error.response?.data?.message || error.message,
      errorCode: error.response?.data?.errorCode,
      details: error.response?.data || null,
    });
  }
};

/**
 * Validate UPI VPA (Required before UPI_COLLECT)
 * POST /api/autopay/validate-vpa
 */
export const validateUpiVpa = async (req, res) => {
  try {
    const { vpa } = req.body;

    if (!vpa) {
      return res.status(400).json({ message: "VPA आवश्यक है" });
    }

    const token = await getAuthToken();

    const payload = {
      type: "VPA",
      vpa,
    };

    const validateUrl = `${PHONEPE_BASE_URL}/v2/validate/upi`;

    const response = await axios.post(validateUrl, payload, {
      headers: {
        Authorization: `O-Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const { valid, name } = response.data;

    return res.status(200).json({
      success: true,
      valid,
      name: name || null,
    });
  } catch (error) {
    console.error("VPA Validation Error:", error.response?.data || error.message);
    return res.status(500).json({
      message: "VPA सत्यापन में त्रुटि",
      error: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Check Subscription Order Status
 * GET /api/autopay/subscription/order/:merchantOrderId/status
 * This checks the status of the SETUP order
 */
export const checkSubscriptionOrderStatus = async (req, res) => {
  try {
    const { merchantOrderId } = req.params;

    if (!merchantOrderId) {
      return res.status(400).json({ message: "Order ID आवश्यक है" });
    }

    console.log(`Checking order status for: ${merchantOrderId}`);

    // Find subscription by orderId (merchantOrderId)
    const subscription = await prisma.membershipPayment.findFirst({
      where: { orderId: merchantOrderId },
    });

    if (!subscription) {
      console.error(`Subscription not found for orderId: ${merchantOrderId}`);
      return res.status(404).json({ 
        message: "सदस्यता रिकॉर्ड नहीं मिला",
        error: "Subscription not found in database",
        searchedOrderId: merchantOrderId,
      });
    }

    console.log(`Found subscription:`, {
      id: subscription.id,
      transactionId: subscription.transactionId,
      orderId: subscription.orderId,
      phonePeOrderId: subscription.phonePeOrderId,
    });

    const token = await getAuthToken();
    const statusUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/order/${merchantOrderId}/status?details=true`;
   
    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `O-Bearer ${token}`,
        "Accept": "application/json",
      },
      validateStatus: (status) => status < 600,
    });

    console.log("PhonePe Order Status Response:", JSON.stringify(response.data, null, 2));

    if (response.status !== 200) {
      throw new Error(`PhonePe API Error: ${JSON.stringify(response.data)}`);
    }

    const { state, subscriptionId, merchantSubscriptionId } = response.data;

    // Update database based on order state
    const updateData = {
      updatedAt: new Date(),
    };
    
    if (state === "COMPLETED") {
      updateData.status = "success";
      if (subscriptionId && !subscription.phonePeSubscriptionId) {
        updateData.phonePeSubscriptionId = subscriptionId;
      }
      console.log(`✅ Setup completed: ${merchantSubscriptionId || subscription.transactionId}`);
    } else if (state === "FAILED") {
      updateData.status = "failed";
      console.log(`❌ Setup failed: ${merchantSubscriptionId || subscription.transactionId}`);
    } else if (state === "PENDING") {
      updateData.status = "pending";
      console.log(`⏳ Setup pending: ${merchantSubscriptionId || subscription.transactionId}`);
    }

    // Update the record using the string ID
    await prisma.membershipPayment.update({
      where: { id: subscription.id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...response.data,
        localSubscriptionId: subscription.id,
        merchantSubscriptionId: subscription.transactionId,
        dbStatus: updateData.status || subscription.status,
      },
    });
  } catch (error) {
    console.error("Check Order Status Error:", error.response?.data || error.message);
    
    if (error.response) {
      console.error("Response Status:", error.response.status);
      console.error("Response Headers:", error.response.headers);
    }
    
    return res.status(500).json({
      message: "स्थिति जांचने में त्रुटि",
      error: error.response?.data?.message || error.message,
      errorCode: error.response?.data?.errorCode,
    });
  }
};

/**
 * Get Subscription Status (checks the subscription mandate status)
 * GET /api/autopay/subscription/:merchantSubscriptionId/status
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const { merchantSubscriptionId } = req.params;
    
    console.log(`Getting subscription status for: ${merchantSubscriptionId}`);

    if (!merchantSubscriptionId) {
      return res.status(400).json({ message: "Subscription ID आवश्यक है" });
    }

    // Find by transactionId (merchantSubscriptionId)
    const subscription = await prisma.membershipPayment.findFirst({
      where: { transactionId: merchantSubscriptionId },
    });

    if (!subscription) {
      console.error(`Subscription not found for transactionId: ${merchantSubscriptionId}`);
      return res.status(404).json({ 
        message: "सदस्यता नहीं मिली",
        error: "Subscription not found in database",
        searchedSubscriptionId: merchantSubscriptionId,
      });
    }

    console.log(`Found subscription:`, {
      id: subscription.id,
      transactionId: subscription.transactionId,
      status: subscription.status,
    });

    const token = await getAuthToken();
    const statusUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/${merchantSubscriptionId}/status`;

    const response = await axios.get(statusUrl, {
      headers: {
        Authorization: `O-Bearer ${token}`,
        "Accept": "application/json",
      },
      validateStatus: (status) => status < 600,
    });

    console.log("Subscription Status Response:", JSON.stringify(response.data, null, 2));

    if (response.status !== 200) {
      throw new Error(`PhonePe API Error: ${JSON.stringify(response.data)}`);
    }

    const { state, subscriptionId } = response.data;

    // Map PhonePe states to database states
    let dbStatus = "pending";
    if (state === "ACTIVE") {
      dbStatus = "success";
    } else if (state === "CANCELLED" || state === "FAILED" || state === "EXPIRED") {
      dbStatus = "failed";
    } else if (state === "PAUSED") {
      dbStatus = "paused";
    } else if (state === "INACTIVE") {
      dbStatus = "inactive";
    }

    console.log(`Subscription state: ${state} → DB status: ${dbStatus}`);

    // Update database
    const updateData = { 
      status: dbStatus,
      updatedAt: new Date(),
    };
    
    if (subscriptionId && !subscription.phonePeSubscriptionId) {
      updateData.phonePeSubscriptionId = subscriptionId;
    }

    await prisma.membershipPayment.update({
      where: { id: subscription.id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      data: {
        ...response.data,
        localSubscriptionId: subscription.id,
        dbStatus,
      },
    });
  } catch (error) {
    console.error("Get Subscription Status Error:", error.response?.data || error.message);
    
    if (error.response) {
      console.error("Response Status:", error.response.status);
    }
    
    return res.status(500).json({
      message: "सदस्यता स्थिति प्राप्त करने में त्रुटि",
      error: error.response?.data?.message || error.message,
      errorCode: error.response?.data?.errorCode,
    });
  }
};

/**
 * Notify Customer before Redemption
 * POST /api/autopay/subscription/notify
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
      dueDate: dueDate || Date.now() + (24 * 60 * 60 * 1000),
      description: description || "आगामी भुगतान अधिसूचना",
    };

    const notifyUrl = `${PHONEPE_BASE_URL}/subscriptions/v2/notify`;
    const response = await axios.post(notifyUrl, payload, {
      headers: {
        Authorization: `O-Bearer ${token}`,
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
 */
export const executeRedemption = async (req, res) => {
  try {
    const { merchantSubscriptionId, amount, description } = req.body;

    if (!merchantSubscriptionId || !amount) {
      return res.status(400).json({ message: "आवश्यक फ़ील्ड गायब हैं" });
    }

    const token = await getAuthToken();
    const merchantOrderId = `REDEEM_${Date.now()}_${randomUUID().substring(0, 8)}`;
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
        Authorization: `O-Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const { orderId, state } = response.data;

    // Find subscription
    const subscription = await prisma.membershipPayment.findFirst({
      where: { transactionId: merchantSubscriptionId },
    });

    if (subscription) {
      // Create payment record
      const paymentMetadata = {
        phonePeOrderId: orderId,
        merchantSubscriptionId,
        merchantOrderId,
      };

      await prisma.payment.create({
        data: {
          id: randomUUID(),
          userId: subscription.userId,
          referenceId: merchantOrderId,
          provider: "phonepe_autopay",
          amount: amount,
          status: state === "COMPLETED" ? "success" : "pending",
          metadata: JSON.stringify(paymentMetadata),
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
        Authorization: `O-Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    // Update subscription status
    await prisma.membershipPayment.updateMany({
      where: { transactionId: merchantSubscriptionId },
      data: { 
        status: "cancelled",
        updatedAt: new Date(),
      },
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
      paymentMethod: "phonepe_autopay",
    };

    if (status) {
      filters.status = status;
    }

    if (search) {
      filters.OR = [
        { name: { contains: search, } },
        { email: { contains: search, } },
        { phone: { contains: search } },
        { membershipType: { contains: search,} },
        { transactionId: { contains: search } },
        { orderId: { contains: search } },
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
      where: { id: parseInt(id) },
    });

    if (!subscription) {
      return res.status(404).json({ message: "सदस्यता नहीं मिली" });
    }

    if (userRole !== "admin" && subscription.userId !== userId) {
      return res.status(403).json({ message: "अनधिकृत पहुंच" });
    }

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