import { prisma } from '../prisma/config.js';
import cloudinary from '../utils/cloudinary.js';
import redisClient from '../services/redis.js';
import fs from "fs/promises";

// ✅ GET ALL SANSTHANS (Cached & Ordered)
export const getAllSansthans = async (req, res) => {
  try {
    const cacheKey = "all_sansthans";
    const cached = await redisClient.get(cacheKey);

    if (cached) {
      console.log("Cache Hit: All Sansthans");
      return res.status(200).json(JSON.parse(cached));
    }

    console.log("Cache Miss: All Sansthans");
    const sansthans = await prisma.dtaSanssthan.findMany({
      // MODIFIED: Order by the new 'order' field
      orderBy: { order: 'asc' } 
    });

    const response = {
      success: true,
      count: sansthans.length,
      data: sansthans
    };

    // Cache for 30 mins
    await redisClient.setEx(cacheKey, 1800, JSON.stringify(response));

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching sansthans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sansthans',
      error: error.message
    });
  }
};

// ✅ GET SINGLE SANSTHAN (Cached)
// (No changes needed here)
export const getSansthanById = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `sansthan:${id}`;

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log(`Cache Hit: Sansthan ${id}`);
      return res.status(200).json(JSON.parse(cached));
    }

    console.log(`Cache Miss: Sansthan ${id}`);
    const sansthan = await prisma.dtaSanssthan.findUnique({
      where: { id: parseInt(id) }
    });

    if (!sansthan) {
      return res.status(404).json({
        success: false,
        message: 'Sansthan not found'
      });
    }

    const response = { success: true, data: sansthan };
    await redisClient.setEx(cacheKey, 1800, JSON.stringify(response)); // Cache 30 mins

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching sansthan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sansthan',
      error: error.message
    });
  }
};

// ✅ CREATE NEW SANSTHAN (Invalidate Cache & Set Order)
export const createSansthan = async (req, res) => {
  try {
    const {
      name,
      person,
      email,
      phone,
      altPhone,
      website,
      timing,
      address,
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required fields'
      });
    }

    let imageUrl = null;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'sansthans',
        resource_type: 'image',
        transformation: [
          { width: 800, height: 600, crop: 'limit' },
          { quality: 'auto' }
        ]
      });
      imageUrl = result.secure_url;
      await fs.unlink(req.file.path);
    }

    // --- MODIFIED: Set initial order ---
    // Get the current count of sansthans to set the order for the new one
    const currentCount = await prisma.dtaSanssthan.count();
    // ------------------------------------

    const sansthan = await prisma.dtaSanssthan.create({
      data: {
        name,
        person,
        image: imageUrl,
        email,
        phone,
        altPhone,
        website,
        address,
        timing,
        order: currentCount // Set the order to be the last item
      }
    });

    // 🧹 Invalidate cached list
    await redisClient.del("all_sansthans");

    res.status(201).json({
      success: true,
      message: 'Sansthan created successfully',
      data: sansthan
    });
  } catch (error) {
    console.error('Error creating sansthan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sansthan',
      error: error.message
    });
  }
};

// ✅ UPDATE SANSTHAN (Invalidate Cache)
// (No changes needed here, it correctly invalidates cache)
export const updateSansthan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      person,
      email,
      phone,
      altPhone,
      website,
      timing,
      address,
    } = req.body;

    const existingSansthan = await prisma.dtaSanssthan.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingSansthan) {
      return res.status(404).json({
        success: false,
        message: 'Sansthan not found'
      });
    }

    let imageUrl = existingSansthan.image;

    if (req.file) {
      if (existingSansthan.image) {
        const publicId = existingSansthan.image.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`sansthans/${publicId}`);
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'sansthans',
        resource_type: 'image',
        transformation: [
          { width: 800, height: 600, crop: 'limit' },
          { quality: 'auto' }
        ]
      });
      imageUrl = result.secure_url;
      await fs.unlink(req.file.path);
    }

    // NOTE: We do not update 'order' here. 'order' is only updated
    // by the reorderSansthans function.
    const updatedSansthan = await prisma.dtaSanssthan.update({
      where: { id: parseInt(id) },
      data: {
        name: name || existingSansthan.name,
        person,
        image: imageUrl,
        address, 
        email: email || existingSansthan.email,
        phone: phone || existingSansthan.phone,
        altPhone,
        website,
        timing
      }
    });

    // 🧹 Invalidate caches
    await redisClient.del("all_sansthans");
    await redisClient.del(`sansthan:${id}`);

    res.status(200).json({
      success: true,
      message: 'Sansthan updated successfully',
      data: updatedSansthan
    });
  } catch (error) {
    console.error('Error updating sansthan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sansthan',
      error: error.message
    });
  }
};

// ✅ DELETE SANSTHAN (Invalidate Cache)
// (No changes needed here, it correctly invalidates cache)
export const deleteSansthan = async (req, res) => {
  try {
    const { id } = req.params;

    const sansthan = await prisma.dtaSanssthan.findUnique({
      where: { id: parseInt(id) }
    });

    if (!sansthan) {
      return res.status(404).json({
        success: false,
        message: 'Sansthan not found'
      });
    }

    if (sansthan.image) {
      const publicId = sansthan.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`sansthans/${publicId}`);
    }

    await prisma.dtaSanssthan.delete({
      where: { id: parseInt(id) }
    });

    // 🧹 Invalidate caches
    await redisClient.del("all_sansthans");
    await redisClient.del(`sansthan:${id}`);

    res.status(200).json({
      success: true,
      message: 'Sansthan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting sansthan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete sansthan',
      error: error.message
    });
  }
};


// 🚀 --- NEW FUNCTION --- 🚀
// ✅ REORDER SANSTHANS (Invalidate Cache)
export const reorderSansthans = async (req, res) => {
  const { orderData } = req.body; // Expects: { orderData: [{ id: "...", order: 0 }, ...] }

  if (!orderData || !Array.isArray(orderData)) {
    return res.status(400).json({ success: false, message: "Invalid order data" });
  }

  try {
    // Use a transaction to update all items in one go
    const updatePromises = orderData.map((item) =>
      prisma.dtaSanssthan.update({
        where: { id: parseInt(item.id) },
        data: { order: parseInt(item.order) },
      })
    );

    await prisma.$transaction(updatePromises);

    // 🧹 Invalidate the cache for the list
    await redisClient.del("all_sansthans");

    res.json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    console.error('Error reordering sansthans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message
    });
  }
};