
import {prisma} from '../prisma/config.js';

export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await prisma.bookCoupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: { coupons }
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons'
    });
  }
};

// GET SINGLE COUPON (Admin Only)
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.bookCoupon.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    res.json({
      success: true,
      data: { coupon }
    });
  } catch (error) {
    console.error('Get coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon'
    });
  }
};

// CREATE COUPON (Admin Only)
export const createCoupon = async (req, res) => {
  try {
    const { code, discount, type, description } = req.body;

    // Validation
    if (!code || !discount || !type) {
      return res.status(400).json({
        success: false,
        message: 'Code, discount, and type are required'
      });
    }

    // Validate type
    if (!['PERCENTAGE', 'FIXED'].includes(type.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either PERCENTAGE or FIXED'
      });
    }

    // Validate discount
    if (type.toUpperCase() === 'PERCENTAGE' && (discount < 0 || discount > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount must be between 0 and 100'
      });
    }

    if (parseFloat(discount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Discount must be greater than 0'
      });
    }

    // Check if coupon code already exists
    const existingCoupon = await prisma.bookCoupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    const coupon = await prisma.bookCoupon.create({
      data: {
        code: code.toUpperCase(),
        discount: parseFloat(discount),
        type: type.toUpperCase(),
        description: description || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: { coupon }
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon'
    });
  }
};

// UPDATE COUPON (Admin Only)
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discount, type, description } = req.body;

    // Check if coupon exists
    const existingCoupon = await prisma.bookCoupon.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Build update data
    const updateData = {};
    
    if (code) {
      const codeExists = await prisma.bookCoupon.findFirst({
        where: {
          code: code.toUpperCase(),
          NOT: { id: parseInt(id) }
        }
      });
      
      if (codeExists) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }
      
      updateData.code = code.toUpperCase();
    }

    if (discount !== undefined) {
      if (parseFloat(discount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Discount must be greater than 0'
        });
      }
      updateData.discount = parseFloat(discount);
    }

    if (type) {
      if (!['PERCENTAGE', 'FIXED'].includes(type.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Type must be either PERCENTAGE or FIXED'
        });
      }
      updateData.type = type.toUpperCase();
    }

    if (description !== undefined) {
      updateData.description = description;
    }

    const coupon = await prisma.bookCoupon.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: { coupon }
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon'
    });
  }
};

// DELETE COUPON (Admin Only)
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.bookCoupon.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            orders: true
          }
        }
      }
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Check if coupon has been used
    if (coupon._count.orders > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete coupon. It has been used in ${coupon._count.orders} order(s).`
      });
    }

    await prisma.bookCoupon.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon'
    });
  }
};

// TOGGLE COUPON STATUS (Admin Only)
export const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const existingCoupon = await prisma.bookCoupon.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    const coupon = await prisma.bookCoupon.update({
      where: { id: parseInt(id) },
      data: { active: !existingCoupon.active }
    });

    res.json({
      success: true,
      message: `Coupon ${coupon.active ? 'activated' : 'deactivated'} successfully`,
      data: { coupon }
    });
  } catch (error) {
    console.error('Toggle coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle coupon status'
    });
  }
};

// VALIDATE COUPON (Public for users during checkout)
export const validateCoupon = async (req, res) => {
  try {
    const { code, bookId } = req.body;
        

    if (!code || !bookId) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code and bookId are required'
      });
    }

    // Fetch the coupon
    const coupon = await prisma.bookCoupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    if (!coupon.active) {
      return res.status(400).json({
        success: false,
        message: 'This coupon is no longer active'
      });
    }

    // Fetch the book to get its price
    const book = await prisma.book.findUnique({
      where: { id: parseInt( bookId)}
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    const totalAmount = book.price;

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = (totalAmount * coupon.discount) / 100;
    } else {
      discountAmount = coupon.discount;
    }

    const finalAmount = Math.max(totalAmount - discountAmount, 0);

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discount: coupon.discount,
          type: coupon.type,
          description: coupon.description
        },
        discountAmount,
        finalAmount
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon'
    });
  }
};
