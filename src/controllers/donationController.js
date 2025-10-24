import dotenv from "dotenv";
import crypto, { randomUUID } from "crypto";
import { prisma } from "../prisma/config.js";
import { MetaInfo, StandardCheckoutPayRequest } from "pg-sdk-node";
import phonePe from "../utils/phonepeClient.js"; // PhonePe SDK instance

dotenv.config();

/**
 * Create Donation
 */
export const createDonation = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user?.id; // from verifyToken

    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Invalid donation amount" });
    }

    const amountInPaisa = Math.round(amount * 100);
    const merchantOrderId = randomUUID();

    const redirectUrl = `${process.env.BACKEND_URL}/api/donations/callback?orderId=${merchantOrderId}`;

    const metaInfo = MetaInfo.builder()
      .udf1(String(userId))
      .udf2("Donation Payment")
      .build();

    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaisa)
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo)
      .build();

    const response = await phonePe.pay(request);
   
    if (!response || !response.redirectUrl) {
      console.error("PhonePe Payment Error:", response);
      return res.status(500).json({ message: "Failed to initiate PhonePe payment" });
    }

    await prisma.donation.create({
      data: {
        userId,
        amount,
        status: "pending",
        paymentMethod: "phonepe",
        transactionId: merchantOrderId,
      },
    });

    return res.status(200).json({
      redirectUrl: response.redirectUrl,
      orderId: merchantOrderId,
    });
  } catch (error) {
    console.error("Create Donation Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Donation Callback
 */
export const donationCallback = async (req, res) => {
  try {
    // Get orderId from query params
    const merchantTransactionId = req.query.orderId;
    if (!merchantTransactionId) {
      return res.status(400).send("Missing orderId in callback");
    }

    // Fetch actual status from PhonePe API
    let status = "pending";
    try {
      const orderStatusResponse = await phonePe.getOrderStatus(merchantTransactionId);
      if (orderStatusResponse?.state === "COMPLETED") status = "success";
      else if (orderStatusResponse?.state === "FAILED") status = "failed";
    } catch (err) {
      console.error("Error fetching PhonePe order status:", err.message);
    }

    // Update donation in DB
    await prisma.donation.update({
      where: { transactionId: merchantTransactionId },
      data: { status },

    });

    // Redirect user to frontend with status
    return res.redirect(
      `${process.env.FRONTEND_URL}/donation-status?status=${status}&orderId=${merchantTransactionId}`
    );
  } catch (err) {
    console.error("Donation Callback Error:", err.message);
    res.status(500).send("Callback handling failed");
  }
};
/**
 * PhonePe Webhook (server-to-server notifications)
 */
export const phonePeWebhook = async (req, res) => {
  try {
    let rawBody = '';
    req.on('data', chunk => (rawBody += chunk));
    req.on('end', async () => {
      console.log("Raw PhonePe Callback:", rawBody);

      const authHeader = req.headers["authorization"] || req.headers["Authorization"];
      if (!authHeader) return res.status(400).send("Missing Authorization header");

      let callbackResponse;
      try {
        callbackResponse = phonePe.validateCallback(
          process.env.PHONEPE_USERNAME,
          process.env.PHONEPE_PASSWORD,
          authHeader,
          rawBody
        );
      } catch (err) {
        console.error("Callback validation failed:", err.message);
        return res.status(400).send("Invalid callback");
      }
  console.log(callbackResponse)
      const state = callbackResponse.payload.state; // CHECKOUT_ORDER_COMPLETED / FAILED
      const originalMerchantOrderId = callbackResponse.payload.originalMerchantOrderId;

      // Map PhonePe state to DB status
      let status = "pending";
      if (state === "CHECKOUT_ORDER_COMPLETED") status = "success";
      else if (state === "CHECKOUT_ORDER_FAILED") status = "failed";

      await prisma.donation.updateMany({
        where: { transactionId: originalMerchantOrderId },
        data: { status },
      });

      res.status(200).send("OK"); // acknowledge PhonePe
    });
  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.status(500).send("Webhook handling failed");
  }
};