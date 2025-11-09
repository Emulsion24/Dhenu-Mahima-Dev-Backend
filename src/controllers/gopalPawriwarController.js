import {prisma} from "../prisma/config.js";
import cloudinary from '../utils/cloudinary.js';
import fs from "fs/promises";



export const createGopal = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "gopalpariwar",
      resource_type: "image",
    });

    // Delete local file after upload
    await fs.unlink(req.file.path);

    const {
      heroTitle,
      heroSubtitle,
      personalInfo,
      spiritualEducation,
      lifeJourney,
      responsibilities,
      pledges,
      socialLinks,
    } = req.body;

    // 🧮 Get the current max order
    const maxOrderObj = await prisma.gopalPariwar.aggregate({
      _max: { order: true },
    });

    const nextOrder = (maxOrderObj._max.order || 0) + 1;

    // ✅ Create new Gopal entry
    const newGopal = await prisma.gopalPariwar.create({
      data: {
        heroImage: result.secure_url,
        heroTitle,
        heroSubtitle,
        personalInfo, // ✅ Pass directly (assuming it's a JSON string from FormData)
        spiritualEducation, // ✅ FIX: Pass directly, just like in updateGopal
        lifeJourney,
        responsibilities,
        pledges,
        socialLinks, // ✅ FIX: Pass directly, just like in updateGopal
        order: nextOrder,
      },
    });

    res.status(201).json(newGopal);
  } catch (err) {
    console.error("Error creating GopalPariwar:", err);
    res.status(500).json({ error: "Failed to create GopalPariwar data" });
  }
};


// Get all GopalPariwar
export const getAllGopal = async (req, res) => {
  try {
    const gopals = await prisma.gopalPariwar.findMany({
      orderBy: {
        order: "asc",
      },
    });
    res.status(200).json(gopals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};

// Get single GopalPariwar by ID
export const getGopalById = async (req, res) => {
    const   idInt = parseInt(req.params.id, 10);

if (isNaN(idInt)) {
  return res.status(400).json({ error: "Invalid ID" });
}
  try {
    const gopal = await prisma.gopalPariwar.findUnique({ where: { id:idInt } });
    if (!gopal) return res.status(404).json({ error: "GopalPariwar not found" });
    res.status(200).json(gopal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
};

// Update GopalPariwar
export const updateGopal = async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    heroImage,
    socialLinks,
    heroTitle,
    heroSubtitle,
    personalInfo,
    spiritualEducation,
    lifeJourney,
    responsibilities,
    pledges,
    order, // 👈 comes from frontend
  } = req.body;

  try {
    // First, get existing record to compare current order
    const existing = await prisma.gopalPariwar.findUnique({
      where: { id },
      select: { order: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Record not found" });
    }

    const oldOrder = existing.order;
    const newOrder = parseInt(order);

    // If order field is provided and changed, handle shifting logic
    if (!isNaN(newOrder) && newOrder !== oldOrder) {
      if (newOrder < oldOrder) {
        // Moving UP: Shift down records between newOrder and oldOrder - 1
        await prisma.gopalPariwar.updateMany({
          where: {
            order: {
              gte: newOrder,
              lt: oldOrder,
            },
          },
          data: {
            order: { increment: 1 },
          },
        });
      } else if (newOrder > oldOrder) {
        // Moving DOWN: Shift up records between oldOrder + 1 and newOrder
        await prisma.gopalPariwar.updateMany({
          where: {
            order: {
              gt: oldOrder,
              lte: newOrder,
            },
          },
          data: {
            order: { decrement: 1 },
          },
        });
      }
    }

    // Now update the current record
    const updatedGopal = await prisma.gopalPariwar.update({
      where: { id },
      data: {
        heroImage,
        heroTitle,
        heroSubtitle,
        personalInfo,
        spiritualEducation,
        lifeJourney,
        responsibilities,
        pledges,
        socialLinks,
        ...(order && { order: newOrder }), // update order if provided
      },
    });

    res.status(200).json(updatedGopal);
  } catch (err) {
    console.error("Error updating GopalPariwar:", err);
    res.status(500).json({ error: "Failed to update data" });
  }
};

// Delete GopalPariwar
export const deleteGopal = async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    // ✅ Find the record to know its order before deleting
    const existing = await prisma.gopalPariwar.findUnique({
      where: { id },
      select: { order: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Gopal not found" });
    }

    const deletedOrder = existing.order;

    // ✅ Delete the record
    await prisma.gopalPariwar.delete({
      where: { id },
    });

    // ✅ Shift all items below this up by 1
    await prisma.gopalPariwar.updateMany({
      where: {
        order: {
          gt: deletedOrder,
        },
      },
      data: {
        order: { decrement: 1 },
      },
    });

    res.status(200).json({ message: "Deleted successfully and order updated" });
  } catch (err) {
    console.error("Error deleting GopalPariwar:", err);
    res.status(500).json({ error: "Failed to delete data" });
  }
};

