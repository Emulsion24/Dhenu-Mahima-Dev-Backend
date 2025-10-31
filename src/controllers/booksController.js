import {prisma} from '../prisma/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GET ALL BOOKS (Public)
export const getAllBooks = async (req, res) => {
  try {
    const { search, sortBy = 'newest', page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where condition
    const where = search
      ? {
          OR: [
            { name: { contains: search } },
            { author: { contains: search } },
            { description: { contains: search } }
          ]
        }
      : {};

    // Build order by
    let orderBy = {};
    switch (sortBy) {
      case 'newest':
        orderBy = { uploadDate: 'desc' };
        break;
      case 'oldest':
        orderBy = { uploadDate: 'asc' };
        break;
      case 'name':
        orderBy = { name: 'asc' };
        break;
      case 'price-low':
        orderBy = { price: 'asc' };
        break;
      case 'price-high':
        orderBy = { price: 'desc' };
        break;
      default:
        orderBy = { uploadDate: 'desc' };
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          author: true,
          fileSize: true,
          price: true,
          fileName: true,
          description: true,
          coverImage: true,
          uploadDate: true
        }
      }),
      prisma.book.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        books,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch books'
    });
  }
};

// GET SINGLE BOOK BY ID (Public)
export const getBookById = async (req, res) => {
  try {
    const { id } = req.params;

    const book = await prisma.book.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        name: true,
        author: true,
        fileSize: true,
        price: true,
        description: true,
        coverImage: true,
        uploadDate: true,
        _count: {
          select: {
            purchases: true
          }
        }
      }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    res.json({
      success: true,
      data: { book }
    });
  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch book'
    });
  }
};

// CREATE BOOK (Admin Only)
export const createBook = async (req, res) => {
  try {
    const { name, author, price, description } = req.body;
     const pdfFile = req.files?.pdf?.[0];         // PDF file from multer
    const coverImageFile = req.files?.image?.[0]; 

    // Validation
    if (!name || !author || !price || !pdfFile ||!coverImageFile) {
      return res.status(400).json({
        success: false,
        message: 'Name, author, price, and PDF file are required'
      });
    }

    const fileSize = (pdfFile.size / (1024 * 1024)).toFixed(2) + ' MB';
   const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';
let imagePath = coverImageFile ? `${BASE_URL}/uploads/images/${coverImageFile.filename}` : `${BASE_URL}/images/1.png`;
    const book = await prisma.book.create({
      data: {
        name,
        author,
        coverImage:imagePath,
        fileName: pdfFile.filename,
        filePath: pdfFile.path,
        fileSize,
        price: parseFloat(price),
        description: description || null
      }
    });

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: { book }
    });
  } catch (error) {
    console.error('Create book error:', error);
    
    // Delete uploaded file if database insert fails
    const files = [
      req.files?.pdf?.[0],
      req.files?.image?.[0],
    ].filter(Boolean);

    files.forEach((file) => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });

    res.status(500).json({
      success: false,
      message: "Failed to create book",
    });
  }
};

// UPDATE BOOK (Admin Only)
export const updateBook = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, author, price, description } = req.body;
    const pdfFile = req.file;

    // Check if book exists
    const existingBook = await prisma.book.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingBook) {
      if (pdfFile && fs.existsSync(pdfFile.path)) {
        fs.unlinkSync(pdfFile.path);
      }
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (author) updateData.author = author;
    if (price) updateData.price = parseFloat(price);
    if (description !== undefined) updateData.description = description;

    // If new PDF uploaded, delete old one and update
    if (pdfFile) {
      // Delete old PDF file
      if (fs.existsSync(existingBook.filePath)) {
        fs.unlinkSync(existingBook.filePath);
      }
      
      updateData.fileName = pdfFile.filename;
      updateData.filePath = pdfFile.path;
      updateData.fileSize = (pdfFile.size / (1024 * 1024)).toFixed(2) + ' MB';
    }

    const book = await prisma.book.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      success: true,
      message: 'Book updated successfully',
      data: { book }
    });
  } catch (error) {
    console.error('Update book error:', error);
    
    // Delete uploaded file if update fails
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update book'
    });
  }
};

// DELETE BOOK (Admin Only)
export const deleteBook = async (req, res) => {
  try {
    const { id } = req.params;

    const book = await prisma.book.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: {
            purchases: true
          }
        }
      }
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    // Check if book has purchases
    if (book._count.purchases > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete book. ${book._count.purchases} user(s) have purchased this book.`
      });
    }

    // Delete file from storage
    if (fs.existsSync(book.filePath)) {
      fs.unlinkSync(book.filePath);
    }

    // Delete cover image if exists
    if (book.coverImage) {
      const coverPath = path.join(__dirname, '..', '..', 'uploads', 'covers', book.coverImage);
      if (fs.existsSync(coverPath)) {
        fs.unlinkSync(coverPath);
      }
    }

    await prisma.book.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Book deleted successfully'
    });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete book'
    });
  }
};

// STREAM PDF (Protected - Only for purchased users)
export const streamPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user purchased this book
    const purchase = await prisma.bookPurchase.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId: parseInt(id)
        }
      },
      include: {
        book: true
      }
    });

    if (!purchase || !purchase.accessGranted) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this book. Please purchase it first.'
      });
    }

    const filePath = purchase.book.filePath;

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found on server'
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    // Prevent caching to enhance security
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const rawName = purchase.book.name || "book";
    const safeFilename = encodeURIComponent(rawName.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim());

    // Support Range Requests for faster loading
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      // Create stream for the requested range
      const stream = fs.createReadStream(filePath, { start, end });

      // Set partial content headers
      res.status(206); // Partial Content
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunksize);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}.pdf"`);

      // Pipe the stream
      stream.pipe(res);

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error streaming PDF'
          });
        }
      });
    } else {
      // No range request - send entire file (fallback)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename}.pdf"`);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Error streaming PDF'
          });
        }
      });
    }
  } catch (error) {
    console.error('Stream PDF error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to stream PDF'
      });
    }
  }
};

export const downloadPdf = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, "../uploads/others", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/pdf");

    return res.download(filePath);
  } catch (err) {
    console.error("Error downloading file:", err);
    return res.status(500).json({ message: "Error downloading file" });
  }
};
