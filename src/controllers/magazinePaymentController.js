import dotenv from "dotenv";
import crypto, { randomUUID } from "crypto";
import { prisma } from "../prisma/config.js";
import { MetaInfo, StandardCheckoutPayRequest } from "pg-sdk-node";
import phonePe from "../utils/phonepeClient.js"; // PhonePe SDK instance

dotenv.config();

/**
 * Create Membership Payment (PhonePe)
 */
export const createMembershipPayment = async (req, res) => {
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
    } = req.body;

    const userId = req.user?.id; // Assume user is authenticated via middleware

    if (!name || !email || !phone || !address || !membershipType || !amount) {
      return res.status(400).json({ message: "सभी फ़ील्ड आवश्यक हैं।" });
    }

    const amountInPaisa = Math.round(amount * 100);
    const merchantOrderId = randomUUID();

    const redirectUrl = `${process.env.BACKEND_URL}/api/membership/callback?orderId=${merchantOrderId}`;

    const metaInfo = MetaInfo.builder()
      .udf1(String(userId))
      .udf2(`${membershipType} Membership Payment`)
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
      return res.status(500).json({ message: "PhonePe पेमेंट शुरू करने में त्रुटि।" });
    }

    // Save membership payment as pending
    await prisma.membershipPayment.create({
      data: {
        userId,
        name,
        email,
        phone,
        address,
        city,
        state,
        pincode,
        membershipType,
        amount,
        status: "pending",
        transactionId: merchantOrderId,
        paymentMethod: "phonepe",
      },
    });

    return res.status(200).json({
      success: true,
      paymentUrl: response.redirectUrl,
      orderId: merchantOrderId,
    });

  } catch (error) {
    console.error("Create Membership Payment Error:", error.response?.data || error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Membership Payment Callback
 */
export const membershipPaymentCallback = async (req, res) => {
  try {
    const merchantTransactionId = req.query.orderId;
    if (!merchantTransactionId) {
      return res.status(400).send("Missing orderId in callback");
    }

    // Fetch actual status from PhonePe
    let status = "pending";
    try {
      const orderStatusResponse = await phonePe.getOrderStatus(merchantTransactionId);
      if (orderStatusResponse?.state === "COMPLETED") status = "success";
      else if (orderStatusResponse?.state === "FAILED") status = "failed";
    } catch (err) {
      console.error("Error fetching PhonePe order status:", err.message);
    }

    // Update membership payment
    await prisma.membershipPayment.update({
      where: { transactionId: merchantTransactionId },
      data: { status },
    });

    // Redirect to frontend with status
    return res.redirect(
      `${process.env.FRONTEND_URL}/donation-status?status=${status}&orderId=${merchantTransactionId}`
    );

  } catch (err) {
    console.error("Membership Callback Error:", err.message);
    res.status(500).send("Callback handling failed");
  }
};

/**
 * PhonePe Webhook for Membership Payments
 */
export const phonePeMembershipWebhook = async (req, res) => {
  try {
    let rawBody = "";
    req.on("data", chunk => (rawBody += chunk));
    req.on("end", async () => {
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

      const state = callbackResponse.payload.state; // CHECKOUT_ORDER_COMPLETED / FAILED
      const originalMerchantOrderId = callbackResponse.payload.originalMerchantOrderId;

      let status = "pending";
      if (state === "CHECKOUT_ORDER_COMPLETED") status = "success";
      else if (state === "CHECKOUT_ORDER_FAILED") status = "failed";

      await prisma.membershipPayment.updateMany({
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
