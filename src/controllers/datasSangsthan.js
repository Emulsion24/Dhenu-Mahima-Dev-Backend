import { prisma } from '../prisma/config.js';
import cloudinary from '../utils/cloudinary.js';
import redisClient from '../services/redis.js'; // ✅ Add Redis
import fs from "fs/promises";

// ✅ GET ALL SANSTHANS (Cached)
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
      orderBy: { createdAt: 'desc' }
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

// ✅ CREATE NEW SANSTHAN (Invalidate Cache)
export const createSansthan = async (req, res) => {
  try {
    const {
      name,
      person,
      description,
      email,
      phone,
      altPhone,
      website,
      timing,
      address,
      city,
      state,
      pincode
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

    const fullAddress = address && city && state && pincode 
      ? `${address}, ${city}, ${state} - ${pincode}`
      : null;

    const sansthan = await prisma.dtaSanssthan.create({
      data: {
        name,
        person,
        image: imageUrl,
        description: fullAddress && description 
          ? `${description}\n\nAddress: ${fullAddress}`
          : description || fullAddress,
        email,
        phone,
        altPhone,
        website,
        timing
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
export const updateSansthan = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      person,
      description,
      email,
      phone,
      altPhone,
      website,
      timing,
      address,
      city,
      state,
      pincode
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

    const fullAddress = address && city && state && pincode 
      ? `${address}, ${city}, ${state} - ${pincode}`
      : null;

    const updatedSansthan = await prisma.dtaSanssthan.update({
      where: { id: parseInt(id) },
      data: {
        name: name || existingSansthan.name,
        person,
        image: imageUrl,
        description: fullAddress && description 
          ? `${description}\n\nAddress: ${fullAddress}`
          : description || fullAddress || existingSansthan.description,
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
