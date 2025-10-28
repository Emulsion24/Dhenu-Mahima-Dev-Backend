import dotenv from "dotenv";
import crypto, { randomUUID } from "crypto";
import { prisma } from "../prisma/config.js";
import { MetaInfo, StandardCheckoutPayRequest } from "pg-sdk-node";
import phonePe from "../utils/phonepeClient.js"; // PhonePe SDK instance
import { sendDonationThankYouEmail } from "../services/emailService.js";

dotenv.config();
const getDonationFilters = (query) => {
  const { search, status, timePeriod } = query;
  const where = {};

  // 1. Status Filter
  if (status && status !== 'All') {
    where.status = status;
  }

  // 2. Time Period Filter
  if (timePeriod && timePeriod !== 'All Time') {
    const today = new Date();
    let startDate;

    switch (timePeriod) {
      case 'Weekly':
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'Monthly':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        break;
      case 'Yearly':
        startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        break;
      default:
        startDate = null;
    }
    
    if (startDate) {
      where.createdAt = {
        gte: startDate,
      };
    }
  }

  // 3. Search Filter
  // This searches transactionId, email, and the related user's name.
  if (search) {
    where.OR = [
      { transactionId: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { user: {
          name: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  return where;
};


export const getAllDonations = async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter conditions
    const where = getDonationFilters(req.query);

    // Get total count for pagination
    const total = await prisma.donation.count({ where });

    // Fetch paginated donations
    const donations = await prisma.donation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { name: true } },
      },
    });

    // Format for frontend
    const formattedDonations = donations.map(d => ({
      id: d.id,
      transactionId: d.transactionId,
      name: d.user?.name ? d.user.name : d.name,
      amount: d.amount,
      email: d.email,
      date: new Date(d.createdAt).toISOString().split('T')[0],
      time: new Date(d.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      paymentMethod: d.paymentMethod,
      cardLast4: d.pan,
      status: d.status,
    }));

    res.status(200).json({
      donations: formattedDonations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).json({ message: 'Error fetching donations', error: error.message });
  }
};

// Also add a delete endpoint if you don't have one
export const deleteDonation = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.donation.delete({
      where: { id: parseInt(id) }
    });

    res.status(200).json({ message: 'Donation deleted successfully' });
  } catch (error) {
    console.error('Error deleting donation:', error);
    res.status(500).json({ message: 'Error deleting donation', error: error.message });
  }
};
/**
 * @desc    Get donation statistics
 * @route   GET /api/donations/stats
 * @access  Private
 */
export const getDonationStats = async (req, res) => {
  try {
    const where = getDonationFilters(req.query);

    // 1. Total Donations (Amount)
    const totalAmountResult = await prisma.donation.aggregate({
      _sum: {
        amount: true,
      },
      where,
    });
    const totalDonations = totalAmountResult._sum.amount || 0;

    // 2. Total Donors (Count of donations, as per your frontend logic)
    const totalDonors = await prisma.donation.count({
      where,
    });
    
    // (Optional) If you want UNIQUE donors:
    // const uniqueDonorsResult = await prisma.donation.findMany({
    //   where,
    //   distinct: ['userId']
    // });
    // const totalUniqueDonors = uniqueDonorsResult.length;


    // 3. Successful Donations
    const successfulDonations = await prisma.donation.count({
      where: {
        ...where,
        status: 'Success',
      },
    });

    res.status(200).json({
      totalDonations,
      totalDonors, // This is the count of donations, matching your frontend
      successfulDonations,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};







/**
 * Create Donation
 */
export const createDonation = async (req, res) => {
  try {
    const { amount,email,pan,name } = req.body;

    const userId = req.user?.id; // from verifyToken

    if (!amount || amount < 1) {
      return res.status(400).json({ message: "Invalid donation amount" });
    }

    const amountInPaisa = Math.round(amount * 100);
    const merchantOrderId = randomUUID();

    const redirectUrl = `${process.env.BACKEND_URL}/api/donations/callback?orderId=${merchantOrderId}`;

    const metaInfo = MetaInfo.builder()
      .udf1(String(userId)||name)
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
        userId:userId?userId :null,
        amount,
        status: "pending",
        paymentMethod: "phonepe",
        transactionId: merchantOrderId,
        email,
        pan:pan?pan:'',
        name:name
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
    const updatedDonation=await prisma.donation.update({
      where: { transactionId: merchantTransactionId },
      data: { status },

    });
    if (status === "success" && updatedDonation.email) {
          await sendDonationThankYouEmail({
          name: updatedDonation.name,
          email: updatedDonation.email,
          amount: updatedDonation.amount,
          transactionId: updatedDonation.transactionId,
      });}

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