import {prisma} from '../prisma/config.js';
import { validationResult } from 'express-validator';
import { generateUniqueSlug } from '../utils/slugify.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// Get all news
export const getAllNews = async (req, res, next) => {
  try {
    const { category, search, featured, page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (category && category !== 'all') {
      where.category = category;
    }

    if (search) {
      where.OR = [
{ title: { contains: search } },
    { titleEn: { contains: search} },
    { excerpt: { contains: search } },
      ];
    }

    if (featured === 'true') {
      where.featured = true;
    }

    const [news, total] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit)
      }),
      prisma.news.count({ where })
    ]);

    res.json({
      success: true,
      data: news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get news by ID
export const getNewsById = async (req, res, next) => {
  try {
      const   idInt = parseInt(req.params.id, 10);

if (isNaN(idInt)) {
  return res.status(400).json({ error: "Invalid ID" });
}

    const news = await prisma.news.findUnique({
      where: { id:idInt }    
      
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Increment views
    await prisma.news.update({
      where: { id: idInt},
      data: { views: { increment: 1 } }
    });

    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    next(error);
  }
};

// Get news by slug
export const getNewsBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const news = await prisma.news.findUnique({
      where: { slug }     
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    // Increment views
    await prisma.news.update({
      where: { slug },
      data: { views: { increment: 1 } }
    });

    res.json({
      success: true,
      data: news
    });
  } catch (error) {
    next(error);
  }
};

// Create news
export const createNews = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      title,
      titleEn,
      excerpt,
      category,
      date,
      readTime,
      featured,
      content,
      tags,
      author,
    } = req.body;


    // Generate unique slug
    const slug = await generateUniqueSlug(prisma, titleEn);

    // Handle image upload
   const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
let imagePath = req.file ? `${BASE_URL}/uploads/news/${req.file.filename}` : `${BASE_URL}/images/1.png`;

    // Parse content and tags if they're strings
    const parsedContent = typeof content === 'string' ? JSON.parse(content) : content;
    const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;

    const news = await prisma.news.create({
      data: {
        title,
        titleEn,
        slug,
        excerpt,
        image: imagePath,
        category,
        date,
        readTime,
        featured: featured === 'true' || featured === true,
        content: parsedContent,
        tags: parsedTags || [],
        author,
      },
    
    });

    res.status(201).json({
      success: true,
      message: 'News created successfully',
      data: news
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// Update news
export const updateNews = async (req, res, next) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existingNews = await prisma.news.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingNews) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    const {
      title,
      titleEn,
      excerpt,
      category,
      date,
      readTime,
      featured,
      content,
      tags,
      author,
    } = req.body;

    // Generate new slug if title changed
    let slug = existingNews.slug;
    if (titleEn && titleEn !== existingNews.titleEn) {
      slug = await generateUniqueSlug(prisma, titleEn, parseInt(id));
    }

    // Handle image upload
    let imagePath = existingNews.image;
    if (req.file) {
      // Delete old image if it's not default
      if (existingNews.image && !existingNews.image.includes('/images/')) {
  
      // Extract filename from URL
      const filename = news.image.split('/').pop();
      const imagePath = path.join(__dirname, '..', 'uploads', 'news', filename);

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      }
        const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
        imagePath = req.file ? `${BASE_URL}/uploads/news/${req.file.filename}` : `${BASE_URL}/images/1.png`;
    }

    // Parse content and tags if they're strings
    const parsedContent = content ? (typeof content === 'string' ? JSON.parse(content) : content) : existingNews.content;
    const parsedTags = tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : existingNews.tags;

    const updatedNews = await prisma.news.update({
      where: { id: parseInt(id) },
      data: {
        title: title || existingNews.title,
        titleEn: titleEn || existingNews.titleEn,
        slug,
        excerpt: excerpt || existingNews.excerpt,
        image: imagePath,
        category: category || existingNews.category,
        date: date || existingNews.date,
        readTime: readTime || existingNews.readTime,
        featured: featured !== undefined ? (featured === 'true' || featured === true) : existingNews.featured,
        content: parsedContent,
        tags: parsedTags,
        author,
      }
    });

    res.json({
      success: true,
      message: 'News updated successfully',
      data: updatedNews
    });
  } catch (error) {
    // Delete uploaded file if error occurs
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// Delete news
export const deleteNews = async (req, res, next) => {
  try {
    const { id } = req.params;

    const news = await prisma.news.findUnique({
      where: { id: parseInt(id) }
    });

    if (!news) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    if (news.image && !news.image.includes('/images/1.png')) {
      // Extract filename from URL
      const filename = news.image.split('/').pop();
      const imagePath = path.join(__dirname, '..', 'uploads', 'news', filename);

      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await prisma.news.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'News deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get related news
export const getRelatedNews = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { limit = 3 } = req.query;

    const currentNews = await prisma.news.findUnique({
      where: { id: parseInt(id) }
    });

    if (!currentNews) {
      return res.status(404).json({
        success: false,
        message: 'News not found'
      });
    }

    const relatedNews = await prisma.news.findMany({
      where: {
        AND: [
          { id: { not: parseInt(id) } },
          { category: currentNews.category }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: relatedNews
    });
  } catch (error) {
    next(error);
  }
};

// Get categories
export const getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.news.groupBy({
      by: ['category'],
      _count: {
        category: true
      }
    });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
};
