import { prisma } from '../prisma/config.js';
import redisClient from '../services/redis.js';

// ✅ BANNER
export async function getBanner(req, res) {
  try {
    const cachedData = await redisClient.get("banner_data");
    if (cachedData) {
      console.log("Cache Hit: Banner Data");
      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache Missed: Banner Data");
    const bannerData = await prisma.banner.findMany({
      orderBy: { order: "asc" },
    });

    await redisClient.setEx("banner_data", 600, JSON.stringify(bannerData)); // 10 mins cache
    res.status(200).json(bannerData);
  } catch (err) {
    console.error("Error fetching banner:", err);
    res.status(500).json({ message: 'Server error' });
  }
}

// ✅ DIRECTOR MESSAGE
export async function getDirectorMessage(req, res) {
  try {
    const cacheKey = "director_message";

    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      console.log("Cache Hit: Director Message");
      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache Missed: Director Message");
    const messageRow = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 1
    });

    if (!messageRow?.length) {
      return res.status(404).json({ message: "Message not found" });
    }

    const latestMessage = messageRow[0];
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(latestMessage)); // 1 hour
    res.json(latestMessage);
  } catch (err) {
    console.error("Error fetching director message:", err);
    res.status(500).json({ message: "Server error" });
  }
}

// ✅ FOUNDATIONS
export const getFoundations = async (req, res) => {
  try {
    const cacheKey = "foundation_data";
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Cache Hit: Foundations");
      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache Missed: Foundations");
    const foundations = await prisma.foundation.findMany({
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      orderBy: { order: "asc" },
    });

    await redisClient.setEx(cacheKey, 1800, JSON.stringify({ foundations })); // 30 mins cache
    res.status(200).json({ foundations });
  } catch (error) {
    console.error("Error fetching foundations:", error);
    res.status(500).json({ error: "Failed to fetch foundations" });
  }
};

// ✅ GOPAL PARIWAR
export const getAllGopal = async (req, res) => {
  try {
    const cacheKey = "gopal_pariwar_data";
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      console.log("Cache Hit: Gopal Pariwar");
      return res.json(JSON.parse(cachedData));
    }

    console.log("Cache Missed: Gopal Pariwar");
    const gopals = await prisma.gopalPariwar.findMany();

    await redisClient.setEx(cacheKey, 1800, JSON.stringify(gopals)); // 30 mins cache
    res.status(200).json(gopals);
  } catch (err) {
    console.error("Error fetching Gopal Pariwar:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};
