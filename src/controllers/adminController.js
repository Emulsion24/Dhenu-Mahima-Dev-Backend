import { prisma } from '../prisma/config.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {generateOtp} from "../utils/generateOtp.js"
import { sendOtpEmail, sendResetPasswordEmail } from '../services/emailService.js';
import cloudinary from '../utils/cloudinary.js';
import fs from "fs";
import redisClient from '../services/redis.js';


export const uploadBanner = async (req, res) => {
  try {
    console.log(req.file);
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
     
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "banners",
      resource_type: "image",
    });

    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    const banner = await prisma.banner.create({
      data: {
        title: req.body.title || "",
        image: result.secure_url,
        order: parseInt(req.body.order, 10),
        publicId:result.public_id
      },
    });
      await redisClient.del("banner_data"); 
    res.json({ message: "Banner uploaded successfully", banner });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed", error });
  }
};

// Delete banner (optional)
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await prisma.banner.findUnique({ where: { id: Number(id) } });

    if (!banner) return res.status(404).json({ message: "Banner not found" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(banner.publicId);

    // Delete from DB
    await prisma.banner.delete({ where: { id: Number(id) } });
     await redisClient.del("banner_data"); 
     
    res.json({ message: "Banner deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting banner", error });
    console.log(error)
  }
};
export async function getBanner(req, res) {
  try {
  const cachedData=await redisClient.get("banner_data");
  if(cachedData){
    console.log("cachedData Hit for Landing Page");
    return res.json(JSON.parse(cachedData));

  }
  console.log("cachedData Missed");
    const bannerData = await prisma.banner.findMany({
       orderBy: { order: "asc" },}
    ); 

    await redisClient.setEx("banner_data", 600, JSON.stringify(bannerData));
    res.status(200).json(bannerData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};


export async function addDirectorMessage(req, res) {
  try {
    const { info } = req.body;

    if (!info) {
      return res.status(400).json({ message: "Message info is required" });
    }

    const newMessage = await prisma.message.create({
      data: {info},
    });

    // Update Redis cache
    await redisClient.del("directorMessage");
 
    res.status(201).json({ message: "Message added successfully", data: newMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export async function deleteDirectorMessage(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Message ID is required" });
    }

    const deletedMessage = await prisma.message.delete({
      where: { id: Number(id) },
    });

    // Clear Redis cache (or update with latest message)
    
    await redisClient.del("directorMessage");

    res.json({ message: "Message deleted successfully", data: deletedMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

export async function getDirectorMessage(req, res) {
  try {
    const cacheKey = "directorMessage";

    // 1️⃣ Check Redis cache first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log("Cache Hit for Director Message");
      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache Missed for Director Message");

    // 2️⃣ Fetch latest message from DB
    const messageRow = await prisma.message.findMany();
    
    if (!messageRow || messageRow.length === 0) {
      return res.status(404).json({ message: "Message not found" });
    }

    const latestMessage = messageRow[0];

    // 3️⃣ Store in Redis for caching (expire in 1 hour)
    // Store the FULL object, not just messageRow.info
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(latestMessage));

    // 4️⃣ Return response
    res.json(latestMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

export const reorderBanners = async (req, res) => {
  try {
    const { orderList } = req.body; 
    // orderList = [{ id: 3, order: 1 }, { id: 5, order: 2 }, ...]

    if (!orderList || !Array.isArray(orderList)) {
      return res.status(400).json({ message: "Invalid order list" });
    }

    // Perform bulk update
    const updatePromises = orderList.map(({ id, order }) =>
      prisma.Banner.update({
        where: { id },
        data: { order },
      })
    );

    await Promise.all(updatePromises);
 await redisClient.del("banner_data"); 
    res.json({ success: true, message: "Banner order updated" });
  } catch (err) {
    console.error("Error updating banner order:", err);
    res.status(500).json({ message: "Failed to update banner order" });
  }
};


