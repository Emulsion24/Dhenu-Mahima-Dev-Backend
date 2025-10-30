// foundationController.js
import {prisma} from '../prisma/config.js';
import redisClient from '../services/redis.js';
import cloudinary from '../utils/cloudinary.js';
import fs from "fs/promises";

// Utility for clearing cache patterns
const clearCachePattern = async (pattern) => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length) await redisClient.del(keys);
  } catch (err) {
    console.error('Cache clear error:', err);
  }
};

// Get all foundations
export const getAllFoundations = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, isActive } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const cacheKey = `foundations:all:${pageNum}:${limitNum}:${search || ''}:${isActive || ''}`;

    // Check cache first
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) return res.json(JSON.parse(cachedData));

    const skip = (pageNum - 1) * limitNum;
    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search,  } },
        { description: { contains: search,  } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    // Single query with Promise.all to release connection faster
    const [foundations, total] = await Promise.all([
      prisma.foundation.findMany({
        where,
        skip,
        take: limitNum,
        select: {
          id: true,
          order:true,
          name: true,
          tagline: true,
          logoUrl: true,
          description: true,
          establishedYear: true,
          isActive: true,
          createdAt: true,
          stats: {
            orderBy: { displayOrder: 'asc' },
            select: { id: true, label: true, value: true, displayOrder: true }
          },
          activities: {
            orderBy: { displayOrder: 'asc' },
            select: { id: true, activityText: true, displayOrder: true }
          },
          objectives: {
            orderBy: { displayOrder: 'asc' },
            select: { id: true, title: true, description: true, objectiveType: true, displayOrder: true }
          },
          contact: {
            select: { email: true, phone: true, address: true, website: true, socialMediaLinks: true }
          },
          media: true,
        },
        orderBy: { order: 'asc' },
      }),
      prisma.foundation.count({ where }),
    ]);

    const response = {
      data: foundations,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    // Cache the result (don't await)
    redisClient.setEx(cacheKey, 600, JSON.stringify(response)).catch(err => 
      console.error('Cache set error:', err)
    );

    res.json(response);
  } catch (error) {
    console.error('Get all foundations error:', error);
    res.status(500).json({ error: 'Failed to fetch foundations' });
  }
};

// Get foundation by ID
export const getFoundationById = async (req, res) => {
  try {
    const foundationId = parseInt(req.params.id, 10);
    const cacheKey = `foundation:${foundationId}`;

    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) return res.json(JSON.parse(cachedData));

    const foundation = await prisma.foundation.findUnique({
      where: { id: foundationId },
      select: {
        id: true,
        name: true,
        tagline: true,
        logoUrl: true,
        description: true,
        establishedYear: true,
        isActive: true,
        createdAt: true,
        stats: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, label: true, value: true, displayOrder: true }
        },
        activities: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, activityText: true, displayOrder: true }
        },
        objectives: {
          orderBy: { displayOrder: 'asc' },
          select: { id: true, title: true, description: true, objectiveType: true, displayOrder: true }
        },
        contact: {
          select: { email: true, phone: true, address: true, website: true, socialMediaLinks: true }
        },
        media: true,
      },
    });

    if (!foundation) return res.status(404).json({ error: 'Foundation not found' });

    redisClient.setEx(cacheKey, 600, JSON.stringify(foundation)).catch(err =>
      console.error('Cache set error:', err)
    );

    res.json(foundation);
  } catch (error) {
    console.error('Get foundation error:', error);
    res.status(500).json({ error: 'Failed to fetch foundation' });
  }
};

// Create foundation
export const createFoundation = async (req, res) => {
  let uploadedFile = null;
  
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    
    uploadedFile = req.file.path;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "foundations",
      resource_type: "image",
    });

    // Delete local file after upload
    await fs.unlink(req.file.path);
    uploadedFile = null;

    const { name, tagline, description, establishedYear, stats, activities, objectives, contact } = req.body;
    const parsedStats = stats ? JSON.parse(stats) : [];
    const parsedActivities = activities ? JSON.parse(activities) : [];
    const parsedObjectives = objectives ? JSON.parse(objectives) : [];
    const parsedContact = contact ? JSON.parse(contact) : null;

    const foundation = await prisma.foundation.create({
      data: {
        name,
        tagline,
        logoUrl: result.secure_url,
        description,
        establishedYear,
        createdById: req.user.id,
        stats: { 
          create: parsedStats.map((s, i) => ({ 
            label: s.label,
            value: s.value,
            displayOrder: i 
          }))
        },
        activities: { 
          create: parsedActivities.map((a, i) => ({ 
            activityText: a, 
            displayOrder: i 
          }))
        },
        objectives: { 
          create: parsedObjectives.map((o, i) => ({ 
            title: o.title,
            description: o.description || "",
            objectiveType: o.objectiveType || "main",
            displayOrder: i 
          }))
        },
        contact: parsedContact ? { 
          create: {
            email: parsedContact.email,
            phone: parsedContact.phone,
            address: parsedContact.address,
            website: parsedContact.website,
            socialMediaLinks: parsedContact.socialMediaLinks || {},
          }
        } : undefined,
      },
      include: { 
        stats: true, 
        activities: true, 
        objectives: true, 
        contact: true 
      },
    });

    // Clear cache (non-blocking)
    clearCachePattern('foundations:*').catch(err => 
      console.error('Cache clear error:', err)
    );
    clearCachePattern('foundation_data');
    res.status(201).json(foundation);
  } catch (error) {
    // Clean up uploaded file if it exists
    if (uploadedFile) {
      await fs.unlink(uploadedFile).catch(() => {});
    }
    
    console.error('Create foundation error:', error);
    res.status(500).json({ error: 'Failed to create foundation' });
  }
};

// Update foundation
export const updateFoundation = async (req, res) => {
  let uploadedFile = null;

  try {
    const foundationId = parseInt(req.params.id, 10);
    const { order } = req.body; // ✅ new order from body if given
    let logoUrl;

    // ✅ Upload new image only if provided
    if (req.file) {
      uploadedFile = req.file.path;
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "foundations",
        resource_type: "image",
      });
      logoUrl = result.secure_url;
      await fs.unlink(req.file.path);
      uploadedFile = null;
    }

    const {
      name,
      tagline,
      description,
      establishedYear,
      isActive,
      stats,
      activities,
      objectives,
      contact,
    } = req.body;

    const parsedStats = stats ? JSON.parse(stats) : [];
    const parsedActivities = activities ? JSON.parse(activities) : [];
    const parsedObjectives = objectives ? JSON.parse(objectives) : [];
    const parsedContact = contact ? JSON.parse(contact) : null;

    const updatedFoundation = await prisma.$transaction(async (tx) => {
      const old = await tx.foundation.findUnique({
        where: { id: foundationId },
        include: { stats: true, activities: true, objectives: true, contact: true },
      });

      if (!old) throw new Error("Foundation not found");

      // ✅ Handle reordering logic if order is given
      if (order && order !== old.order) {
        const existing = await tx.foundation.findFirst({ where: { order: parseInt(order) } });

        if (existing) {
          if (order < old.order) {
            // Move up - shift down others between new and old order
            await tx.foundation.updateMany({
              where: {
                order: {
                  gte: parseInt(order),
                  lt: old.order,
                },
              },
              data: { order: { increment: 1 } },
            });
          } else {
            // Move down - shift up others between old and new order
            await tx.foundation.updateMany({
              where: {
                order: {
                  gt: old.order,
                  lte: parseInt(order),
                },
              },
              data: { order: { decrement: 1 } },
            });
          }
        }
      }

      // Delete old nested relations
      await Promise.all([
        tx.foundationStat.deleteMany({ where: { foundationId } }),
        tx.foundationActivity.deleteMany({ where: { foundationId } }),
        tx.foundationObjective.deleteMany({ where: { foundationId } }),
      ]);

      // ✅ Update foundation data
      const updated = await tx.foundation.update({
        where: { id: foundationId },
        data: {
          name,
          tagline,
          logoUrl: logoUrl || old.logoUrl,
          description,
          establishedYear,
          isActive,
          order: order ? parseInt(order) : old.order, // ✅ order handled
          updatedById: req.user.id,
          stats: {
            create: parsedStats.map((s, i) => ({
              label: s.label,
              value: s.value,
              displayOrder: i,
            })),
          },
          activities: {
            create: parsedActivities.map((a, i) => ({
              activityText: a,
              displayOrder: i,
            })),
          },
          objectives: {
            create: parsedObjectives.map((o, i) => ({
              title: o.title,
              description: o.description || "",
              objectiveType: o.objectiveType || "main",
              displayOrder: i,
            })),
          },
          contact: parsedContact
            ? {
                upsert: {
                  create: {
                    email: parsedContact.email,
                    phone: parsedContact.phone,
                    address: parsedContact.address,
                    website: parsedContact.website,
                    socialMediaLinks: parsedContact.socialMediaLinks || {},
                  },
                  update: {
                    email: parsedContact.email,
                    phone: parsedContact.phone,
                    address: parsedContact.address,
                    website: parsedContact.website,
                    socialMediaLinks: parsedContact.socialMediaLinks || {},
                  },
                },
              }
            : undefined,
        },
        include: { stats: true, activities: true, objectives: true, contact: true },
      });

      return updated;
    });

    // ✅ Clear cache (non-blocking)
    Promise.all([
      clearCachePattern("foundations:*"),
      redisClient.del(`foundation:${foundationId}`),
        redisClient.del("foundation_data"),
    ]).catch((err) => console.error("Cache clear error:", err));

    res.json(updatedFoundation);
  } catch (error) {
    if (uploadedFile) await fs.unlink(uploadedFile).catch(() => {});
    console.error("Update foundation error:", error);

    if (error.message === "Foundation not found") {
      return res.status(404).json({ error: "Foundation not found" });
    }

    res.status(500).json({ error: "Failed to update foundation" });
  }
};


// Delete foundation
export const deleteFoundation = async (req, res) => {
  try {
    const foundationId = parseInt(req.params.id, 10);

    // Use transaction to ensure atomicity
    const deletedFoundation = await prisma.$transaction(async (tx) => {
      // 🔹 Find foundation with order before deleting
      const found = await tx.foundation.findUnique({
        where: { id: foundationId },
        include: { stats: true, activities: true, objectives: true, contact: true },
      });

      if (!found) throw new Error("Foundation not found");

      const deletedOrder = found.order;

      // 🔹 Delete foundation and its relations
      await Promise.all([
        tx.foundationStat.deleteMany({ where: { foundationId } }),
        tx.foundationActivity.deleteMany({ where: { foundationId } }),
        tx.foundationObjective.deleteMany({ where: { foundationId } }),
        tx.foundation.delete({ where: { id: foundationId } }),
      ]);

      // 🔹 Shift up (decrement) all foundations that had higher order
      await tx.foundation.updateMany({
        where: { order: { gt: deletedOrder } },
        data: { order: { decrement: 1 } },
      });

      return found;
    });

    // ✅ Clear cache (non-blocking)
    Promise.all([
      clearCachePattern("foundations:*"),
      redisClient.del(`foundation:${foundationId}`),
      redisClient.del("foundation_data"),
    ]).catch((err) => console.error("Cache clear error:", err));

    res.json({ message: "Foundation deleted successfully" });
  } catch (error) {
    console.error("Delete foundation error:", error);

    if (error.message === "Foundation not found") {
      return res.status(404).json({ error: "Foundation not found" });
    }

    res.status(500).json({ error: "Failed to delete foundation" });
  }
};
