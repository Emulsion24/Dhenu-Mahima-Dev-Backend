import{ prisma } from "../prisma/config.js";
import redisClient from "../services/redis.js"; // optional caching

// 🟢 GET all cards
export async function getCards(req, res) {
  try {
    const cacheKey = "cards";

    // 1️⃣ Check Redis cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("✅ Cache hit for cards");
      return res.json(JSON.parse(cached));
    }

    // 2️⃣ Fetch from DB
    const cards = await prisma.card.findMany({
      orderBy: { order: "asc" },
    });

    // 3️⃣ Save to cache
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(cards));

    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

// 🟡 ADD a new card
export async function addCard(req, res) {
  try {
    const { title, titleEn, link, image } = req.body;

    if (!title || !link) {
      return res.status(400).json({ message: "Title and link are required" });
    }

    const newCard = await prisma.card.create({
      data: { title, titleEn, link, image },
    });

    // Update cache
    await redisClient.del("cards");

    res.status(201).json({ message: "Card added successfully", data: newCard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

// 🔵 EDIT / UPDATE a card
export async function editCard(req, res) {
  try {
    const { id } = req.params;
    const { title, titleEn, link, image } = req.body;

    if (!id) return res.status(400).json({ message: "Card ID is required" });

    const updatedCard = await prisma.card.update({
      where: { id: parseInt(id) },
      data: { title, titleEn, link, image },
    });

    await redisClient.del("cards");

    res.json({ message: "Card updated successfully", data: updatedCard });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

// 🔴 DELETE a card
export async function deleteCard(req, res) {
  try {
    const { id } = req.params;

    if (!id) return res.status(400).json({ message: "Card ID is required" });

    await prisma.card.delete({
      where: { id: parseInt(id) },
    });

    await redisClient.del("cards");

    res.json({ message: "Card deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
}

export const reorderCards = async (req, res) => {
  try {
    const { orderList } = req.body; // [{ id: 3, order: 1 }, { id: 5, order: 2 }]
    if (!orderList || !Array.isArray(orderList)) {
      return res.status(400).json({ success: false, message: "Invalid order list" });
    }

    const updatePromises = orderList.map(({ id, order }) =>
      prisma.card.update({
        where: { id },
        data: { order },
      })
    );
     await redisClient.del("cards");
    await Promise.all(updatePromises);
    res.json({ success: true, message: "Card order updated" });
  } catch (err) {
    console.error("Error updating card order:", err);
    res.status(500).json({ success: false, message: "Failed to update card order" });
  }
};
