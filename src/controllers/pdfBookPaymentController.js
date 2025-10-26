// controllers/paymentController.js
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { prisma } from "../prisma/config.js";
import { MetaInfo, StandardCheckoutPayRequest } from "pg-sdk-node";
import phonePe from "../utils/phonepeClient.js"; // PhonePe SDK instance

dotenv.config();

/**
 * Calculate Final Price with Coupon
 */
const calculateFinalPrice = async (bookPrice, couponCode) => {
  let finalPrice = bookPrice;
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await prisma.bookCoupon.findFirst({
      where: {
        code: couponCode,
        active: true
      }
    });

    if (coupon) {
      if (coupon.type === 'PERCENTAGE') {
        discount = (bookPrice * coupon.discount) / 100;
      } else if (coupon.type === 'FIXED') {
        discount = coupon.discount;
      }

      finalPrice = Math.max(bookPrice - discount, 0);
      appliedCoupon = coupon;
    }
  }

  return { finalPrice, discount, appliedCoupon };
};

/**
 * CREATE ORDER - Initiate PhonePe Payment for Book Purchase
 */
export const createOrder = async (req, res) => {
  try {
    const { bookId, couponCode } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "कृपया पुस्तक खरीदने के लिए लॉगिन करें"
      });
    }

    if (!bookId) {
      return res.status(400).json({
        success: false,
        message: "पुस्तक ID आवश्यक है"
      });
    }

    // Validate book exists
    const book = await prisma.book.findUnique({
      where: { id: parseInt(bookId) }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "पुस्तक नहीं मिली"
      });
    }

    // Check if user already purchased this book
    const existingPurchase = await prisma.bookPurchase.findFirst({
      where: {
        userId: parseInt(userId),
        bookId: parseInt(bookId)
      }
    });

    if (existingPurchase) {
      return res.status(400).json({
        success: false,
        message: "आपने यह पुस्तक पहले ही खरीद ली है"
      });
    }

    // Calculate final price with coupon
    const { finalPrice, discount, appliedCoupon } = await calculateFinalPrice(
      book.price,
      couponCode
    );

    // Generate unique merchant order ID
    const merchantOrderId = randomUUID();
    const amountInPaisa = Math.round(finalPrice * 100);

    // Redirect URL after payment
    const redirectUrl = `${process.env.BACKEND_URL}/api/pdf-payment/callback?transactionId=${merchantOrderId}`;

    // Meta info for tracking
    const metaInfo = MetaInfo.builder()
      .udf1(String(userId))
      .udf2(`Book Purchase: ${book.name}`)
      .udf3(String(bookId))
      .udf4(couponCode || "NO_COUPON")
      .build();

    // Create PhonePe payment request
    const request = StandardCheckoutPayRequest.builder()
      .merchantOrderId(merchantOrderId)
      .amount(amountInPaisa)
      .redirectUrl(redirectUrl)
      .metaInfo(metaInfo)
      .build();

    // Initiate PhonePe payment
    const response = await phonePe.pay(request);

    if (!response || !response.redirectUrl) {
      console.error("❌ PhonePe Payment Error:", response);
      return res.status(500).json({
        success: false,
        message: "भुगतान शुरू करने में विफल"
      });
    }

    // Create a pending BookOrder first
    const bookOrder = await prisma.bookOrder.create({
      data: {
        userId: parseInt(userId),
        totalAmount: parseFloat(book.price),
        discountAmount: parseFloat(discount),
        finalAmount: parseFloat(finalPrice),
        couponId: appliedCoupon?.id || null,
        orderId: merchantOrderId,
        paymentId: null, // Will be updated on success
        status: "PENDING"
      }
    });

    // Create order item
    await prisma.bookOrderItem.create({
      data: {
        orderId: bookOrder.id,
        bookId: parseInt(bookId),
        price: parseFloat(finalPrice)
      }
    });

    // Log payment in Payment table
    await prisma.payment.create({
      data: {
        userId: parseInt(userId),
        referenceId: merchantOrderId,
        provider: "PHONEPE",
        amount: parseFloat(finalPrice),
        status: "PENDING"
      }
    });

    console.log("✅ Payment initiated:", {
      merchantOrderId,
      orderId: bookOrder.id,
      userId,
      bookId,
      amount: finalPrice,
      discount
    });

    return res.status(200).json({
      success: true,
      message: "भुगतान सफलतापूर्वक शुरू किया गया",
      paymentUrl: response.redirectUrl,
      transactionId: merchantOrderId,
      amount: finalPrice,
      originalAmount: book.price,
      discount,
      couponApplied: !!appliedCoupon
    });

  } catch (error) {
    console.error("❌ Create Order Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "भुगतान शुरू करने में विफल",
      error: error.message
    });
  }
};

/**
 * PAYMENT CALLBACK - Handle PhonePe Redirect After Payment
 */
export const paymentCallback = async (req, res) => {
  try {
    const { transactionId } = req.query;

    if (!transactionId) {
      return res.status(400).send("कॉलबैक में transactionId गुम है");
    }

    console.log("📞 Payment Callback Received:", transactionId);

    // Fetch payment status from PhonePe
    let paymentStatus = "PENDING";
    let phonepeTransactionId = null;

    try {
      const orderStatusResponse = await phonePe.getOrderStatus(transactionId);
      
      console.log("PhonePe Order Status:", orderStatusResponse);

      if (orderStatusResponse?.state === "COMPLETED") {
        paymentStatus = "COMPLETED";
        phonepeTransactionId = orderStatusResponse?.transactionId || transactionId;
      } else if (orderStatusResponse?.state === "FAILED") {
        paymentStatus = "FAILED";
      }
    } catch (err) {
      console.error("❌ Error fetching PhonePe order status:", err.message);
    }

    // Find the BookOrder
    const bookOrder = await prisma.bookOrder.findFirst({
      where: { orderId: transactionId },
      include: {
        items: {
          include: {
            book: true
          }
        },
        user: true
      }
    });

    if (!bookOrder) {
      console.error("❌ Order not found:", transactionId);
      return res.redirect(
        `${process.env.FRONTEND_URL}/donation-status?status=failed&orderId=${merchantTransactionId}`
      );
    }

    // Update BookOrder status
    await prisma.bookOrder.update({
      where: { id: bookOrder.id },
      data: {
        status: paymentStatus,
        paymentId: phonepeTransactionId
      }
    });

    // Update Payment log
    await prisma.payment.updateMany({
      where: { 
        referenceId: transactionId,
        userId: bookOrder.userId
      },
      data: {
        status: paymentStatus === "COMPLETED" ? "success" : "failed"
      }
    });

    // If payment successful, create purchase records
    if (paymentStatus === "COMPLETED") {
      // Get all books from order items
      const orderItems = bookOrder.items;

      for (const item of orderItems) {
        // Check if purchase already exists (prevent duplicates)
        const existingPurchase = await prisma.bookPurchase.findFirst({
          where: {
            userId: bookOrder.userId,
            bookId: item.bookId
          }
        });

        if (!existingPurchase) {
          await prisma.bookPurchase.create({
            data: {
              userId: bookOrder.userId,
              bookId: item.bookId,
              orderId: bookOrder.id,
              purchaseDate: new Date(),
              accessGranted: true
            }
          });

          console.log(`✅ Purchase created for user ${bookOrder.userId}, book ${item.bookId}`);
        }
      }

      // Redirect to success page
      return res.redirect(
        `${process.env.FRONTEND_URL}/pdf-books`
      );
    } else {
      // Redirect to failure page
      return res.redirect(
        `${process.env.FRONTEND_URL}/donation-status?status=failed&transactionId=${transactionId}`
      );
    }

  } catch (err) {
    console.error("❌ Payment Callback Error:", err.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/books?payment=error`
    );
  }
};

/**
 * PHONEPE WEBHOOK - Handle PhonePe Server-to-Server Callback
 */
export const phonePeWebhook = async (req, res) => {
  try {
    let rawBody = "";
    req.on("data", chunk => (rawBody += chunk));
    req.on("end", async () => {
      console.log("📡 PhonePe Webhook Raw Body:", rawBody);

      const authHeader = req.headers["authorization"] || req.headers["Authorization"];
      if (!authHeader) {
        console.error("❌ Missing Authorization header");
        return res.status(400).send("Missing Authorization header");
      }

      let callbackResponse;
      try {
        callbackResponse = phonePe.validateCallback(
          process.env.PHONEPE_USERNAME,
          process.env.PHONEPE_PASSWORD,
          authHeader,
          rawBody
        );
      } catch (err) {
        console.error("❌ Callback validation failed:", err.message);
        return res.status(400).send("Invalid callback");
      }

      console.log("✅ PhonePe Webhook Validated:", callbackResponse);

      const state = callbackResponse.payload.state;
      const merchantOrderId = callbackResponse.payload.originalMerchantOrderId;

      let paymentStatus = "PENDING";
      if (state === "CHECKOUT_ORDER_COMPLETED") {
        paymentStatus = "COMPLETED";
      } else if (state === "CHECKOUT_ORDER_FAILED") {
        paymentStatus = "FAILED";
      }

      // Find the BookOrder
      const bookOrder = await prisma.bookOrder.findFirst({
        where: { orderId: merchantOrderId },
        include: {
          items: true
        }
      });

      if (bookOrder) {
        // Update order status
        await prisma.bookOrder.update({
          where: { id: bookOrder.id },
          data: {
            status: paymentStatus,
            paymentId: merchantOrderId
          }
        });

        // Update Payment log
        await prisma.payment.updateMany({
          where: { 
            referenceId: merchantOrderId,
            userId: bookOrder.userId
          },
          data: {
            status: paymentStatus === "COMPLETED" ? "success" : "failed"
          }
        });

        // Create purchase if payment successful
        if (paymentStatus === "COMPLETED") {
          for (const item of bookOrder.items) {
            const existingPurchase = await prisma.bookPurchase.findFirst({
              where: {
                userId: bookOrder.userId,
                bookId: item.bookId
              }
            });

            if (!existingPurchase) {
              await prisma.bookPurchase.create({
                data: {
                  userId: bookOrder.userId,
                  bookId: item.bookId,
                  orderId: bookOrder.id,
                  purchaseDate: new Date(),
                  accessGranted: true
                }
              });

              console.log(`✅ Purchase created via webhook for user ${bookOrder.userId}, book ${item.bookId}`);
            }
          }
        }
      }

      res.status(200).send("OK");
    });
  } catch (err) {
    console.error("❌ Webhook Error:", err.message);
    res.status(500).send("Webhook handling failed");
  }
};

/**
 * CHECK PAYMENT STATUS - Frontend polling endpoint
 */
export const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user?.id;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID आवश्यक है"
      });
    }

    // Find the BookOrder
    const bookOrder = await prisma.bookOrder.findFirst({
      where: {
        orderId: transactionId,
        userId: parseInt(userId)
      },
      include: {
        items: {
          include: {
            book: {
              select: {
                id: true,
                name: true,
                author: true,
                coverImage: true
              }
            }
          }
        }
      }
    });

    if (!bookOrder) {
      return res.status(404).json({
        success: false,
        message: "भुगतान नहीं मिला"
      });
    }

    // If payment is still pending, check status with PhonePe
    if (bookOrder.status === "PENDING") {
      try {
        const orderStatusResponse = await phonePe.getOrderStatus(transactionId);

        if (orderStatusResponse?.state === "COMPLETED" && bookOrder.status !== "COMPLETED") {
          // Update order status
          await prisma.bookOrder.update({
            where: { id: bookOrder.id },
            data: {
              status: "COMPLETED",
              paymentId: orderStatusResponse?.transactionId || transactionId
            }
          });

          // Update payment log
          await prisma.payment.updateMany({
            where: { 
              referenceId: transactionId,
              userId: bookOrder.userId
            },
            data: {
              status: "success"
            }
          });

          // Create purchase records
          for (const item of bookOrder.items) {
            const existingPurchase = await prisma.bookPurchase.findFirst({
              where: {
                userId: bookOrder.userId,
                bookId: item.bookId
              }
            });

            if (!existingPurchase) {
              await prisma.bookPurchase.create({
                data: {
                  userId: bookOrder.userId,
                  bookId: item.bookId,
                  orderId: bookOrder.id,
                  purchaseDate: new Date(),
                  accessGranted: true
                }
              });
            }
          }

          bookOrder.status = "COMPLETED";
        } else if (orderStatusResponse?.state === "FAILED") {
          await prisma.bookOrder.update({
            where: { id: bookOrder.id },
            data: { status: "FAILED" }
          });

          await prisma.payment.updateMany({
            where: { 
              referenceId: transactionId,
              userId: bookOrder.userId
            },
            data: {
              status: "failed"
            }
          });

          bookOrder.status = "FAILED";
        }
      } catch (statusError) {
        console.error("❌ Status check error:", statusError.message);
      }
    }

    // Map status for frontend
    let paymentStatus = "PENDING";
    if (bookOrder.status === "COMPLETED") {
      paymentStatus = "PAYMENT_SUCCESS";
    } else if (bookOrder.status === "FAILED") {
      paymentStatus = "PAYMENT_FAILED";
    }

    return res.status(200).json({
      success: true,
      paymentStatus,
      transactionId: bookOrder.orderId,
      amount: bookOrder.finalAmount,
      discount: bookOrder.discountAmount,
      books: bookOrder.items.map(item => item.book),
      createdAt: bookOrder.createdAt
    });

  } catch (error) {
    console.error("❌ Check Payment Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "भुगतान स्थिति जांचने में विफल",
      error: error.message
    });
  }
};




/**
 * GET PURCHASED BOOKS - Get all purchased books for streaming
 */
export const getPurchasedBooks = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID आवश्यक है"
      });
    }

    const purchases = await prisma.bookPurchase.findMany({
      where: {
        userId: parseInt(userId),
        accessGranted: true
      },
      select: {
        bookId: true,
        purchaseDate: true,
        book: {
          select: {
            id: true,
            name: true,
            author: true,
            coverImage: true,
            description: true
          }
        }
      },
      orderBy: {
        purchaseDate: 'desc'
      }
    });

    return res.status(200).json({
      success: true,
      purchases: purchases.map(p => ({
        bookId: p.bookId,
        purchaseDate: p.purchaseDate,
        ...p.book
      }))
    });

  } catch (error) {
    console.error("❌ Get Purchased Books Error:", error);
    return res.status(500).json({
      success: false,
      message: "खरीदी गई पुस्तकें प्राप्त करने में विफल",
      error: error.message
    });
  }
};
