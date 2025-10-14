import { prisma } from '../prisma/config.js';
import redisClient from '../services/redis.js';

export async function getBanner(req, res) {
  try {
  const cachedData=await redisClient.get("banner_data");
  if(cachedData){
    console.log("cachedData Hit for Landing Page")

    return res.json(JSON.parse(cachedData));

  }
  console.log("cachedData Missed");
    const bannerData = await prisma.banner.findMany({
       orderBy: { order: "asc" },
    }); 
  
      await redisClient.setEx("banner_data", 600, JSON.stringify(bannerData));
    res.status(200).json(bannerData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
}
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
    const messageRow = await prisma.message.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 1 // Get only the latest message
    });
    
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
export const getFoundations = async (req, res) => {
  try {
    const foundations = await prisma.foundation.findMany({
      select: {
        id: true,
        name: true,
       // optional Hindi name
        logoUrl: true,
       // optional, if you have slugs for routing
      },
      orderBy: {
        id: "asc", // optional ordering
      },
    });

    res.status(200).json({ foundations });
  } catch (error) {
    console.error("Error fetching foundations:", error);
    res.status(500).json({ error: "Failed to fetch foundations" });
  }
};

export const getAllGopal = async (req, res) => {
  try {
    const gopals = await prisma.gopalPariwar.findMany();
    res.status(200).json(gopals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};