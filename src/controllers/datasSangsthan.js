import { prisma } from '../prisma/config.js';
import cloudinary from '../utils/cloudinary.js';
import fs from "fs/promises";

// Get all Sansthans
export const getAllSansthans = async (req, res) => {
  try {
    const sansthans = await prisma.dtaSanssthan.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    res.status(200).json({
      success: true,
      count: sansthans.length,
      data: sansthans
    });
  } catch (error) {
    console.error('Error fetching sansthans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sansthans',
      error: error.message
    });
  }
};

// Get single Sansthan by ID
export const getSansthanById = async (req, res) => {
  try {
    const { id } = req.params.id;
    
    const sansthan = await prisma.dtaSanssthan.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!sansthan) {
      return res.status(404).json({
        success: false,
        message: 'Sansthan not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: sansthan
    });
  } catch (error) {
    console.error('Error fetching sansthan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sansthan',
      error: error.message
    });
  }
};

// Create new Sansthan
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

    // Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required fields'
      });
    }

    let imageUrl = null;

    // Upload image to Cloudinary if provided
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
    }

    // Combine address fields
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

// Update Sansthan
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

    // Check if sansthan exists
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

    // Upload new image to Cloudinary if provided
    if (req.file) {
      // Delete old image from Cloudinary if exists
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
    }

    // Combine address fields
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

// Delete Sansthan
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

    // Delete image from Cloudinary if exists
    if (sansthan.image) {
      const publicId = sansthan.image.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`sansthans/${publicId}`);
    }

    await prisma.dtaSanssthan.delete({
      where: { id: parseInt(id) }
    });

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