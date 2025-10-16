import { prisma } from '../prisma/config.js';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// 🟢 Get all bhajans
export const getAllBhajans = async (req, res) => {
  try {
    const bhajans = await prisma.bhajan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(bhajans);
  } catch (error) {
    console.error('Error fetching bhajans:', error);
    res.status(500).json({ message: 'Failed to fetch bhajans', error: error.message });
  }
};

// 🟢 Get single bhajan by ID
export const getBhajanById = async (req, res) => {
  try {
    const { id } = req.params;
    const bhajan = await prisma.bhajan.findUnique({ where: { id } });
    if (!bhajan) return res.status(404).json({ message: 'Bhajan not found' });
    res.status(200).json(bhajan);
  } catch (error) {
    console.error('Error fetching bhajan:', error);
    res.status(500).json({ message: 'Failed to fetch bhajan', error: error.message });
  }
};

// 🟢 Create new bhajan
export const createBhajan = async (req, res) => {
  try {
    const { name, artist, album, duration } = req.body;

    if (!name || !artist) {
      return res.status(400).json({ message: 'Name and artist are required' });
    }

    if (!req.files || !req.files.audio) {
      return res.status(400).json({ message: 'Audio file is required' });
    }

    const audioFile = req.files.audio[0]; // Multer saves files as arrays
    const imageFile = req.files.image ? req.files.image[0] : null;

    const audioUrl = `${BASE_URL}/uploads/audio/${audioFile.filename}`;
    const audioPath = audioFile.path;

    let imageUrl = null;
    if (imageFile) {
      imageUrl = `${BASE_URL}/uploads/images/${imageFile.filename}`;
    }

    const bhajan = await prisma.bhajan.create({
      data: {
        name,
        artist,
        album: album || null,
        duration: duration || '0:00',
        audioUrl,
        audioPath,
        imageUrl,
      },
    });

    res.status(201).json(bhajan);
  } catch (error) {
    console.error('Error creating bhajan:', error);
    res.status(500).json({ message: 'Failed to create bhajan', error: error.message });
  }
};

// 🟢 Update bhajan
export const updateBhajan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, artist, album, duration } = req.body;

    const existingBhajan = await prisma.bhajan.findUnique({ where: { id } });
    if (!existingBhajan) return res.status(404).json({ message: 'Bhajan not found' });

    let audioUrl = existingBhajan.audioUrl;
    let audioPath = existingBhajan.audioPath;
    let imageUrl = existingBhajan.imageUrl;

    // Replace audio if new uploaded
    if (req.files?.audio) {
      try {
        await fs.unlink(existingBhajan.audioPath);
      } catch (err) {
        console.warn('Old audio not found, skipping delete.');
      }

      const audioFile = req.files.audio[0];
      audioPath = audioFile.path;
      audioUrl = `${BASE_URL}/uploads/audio/${audioFile.filename}`;
    }

    // Replace image if new uploaded
    if (req.files?.image) {
      if (existingBhajan.imageUrl) {
        try {
          const oldImagePath = path.join(__dirname, '..', existingBhajan.imageUrl.replace(BASE_URL, ''));
          await fs.unlink(oldImagePath);
        } catch (err) {
          console.warn('Old image not found, skipping delete.');
        }
      }

      const imageFile = req.files.image[0];
      imageUrl = `${BASE_URL}/uploads/images/${imageFile.filename}`;
    }

    const updatedBhajan = await prisma.bhajan.update({
      where: { id },
      data: {
        name: name || existingBhajan.name,
        artist: artist || existingBhajan.artist,
        album: album ?? existingBhajan.album,
        duration: duration || existingBhajan.duration,
        audioUrl,
        audioPath,
        imageUrl,
      },
    });

    res.status(200).json(updatedBhajan);
  } catch (error) {
    console.error('Error updating bhajan:', error);
    res.status(500).json({ message: 'Failed to update bhajan', error: error.message });
  }
};

// 🟢 Delete bhajan
export const deleteBhajan = async (req, res) => {
  try {
    
    const { id } = req.params;
 
    const bhajan = await prisma.bhajan.findUnique({ where: { id } });
    if (!bhajan) return res.status(404).json({ message: 'Bhajan not found' });

    try {
      await fs.unlink(bhajan.audioPath);
    } catch (err) {
      console.warn('Audio file not found while deleting.');
    }

    if (bhajan.imageUrl) {
      try {
        const imagePath = path.join(__dirname, '..', bhajan.imageUrl.replace(BASE_URL, ''));
        await fs.unlink(imagePath);
      } catch (err) {
        console.warn('Image file not found while deleting.');
      }
    }

    await prisma.bhajan.delete({ where: { id } });
    res.status(200).json({ message: 'Bhajan deleted successfully' });
  } catch (error) {
    console.error('Error deleting bhajan:', error);
    res.status(500).json({ message: 'Failed to delete bhajan', error: error.message });
  }
};

// 🟢 Stream bhajan audio
export const streamAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    console.log(filename)
    const audioPath = path.join(__dirname, '../uploads/audio', filename);

    const stat = await fs.stat(audioPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fssync.createReadStream(audioPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(200, head);
      fssync.createReadStream(audioPath).pipe(res);
    }
  } catch (err) {
    console.error('Error streaming audio:', err);
    res.status(404).json({ message: 'Audio not found' });
  }
};

// 🟢 Admin-only download
export const downloadAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    const audioPath = path.join(__dirname, '../uploads/audio', filename);
    res.download(audioPath);
  } catch (err) {
    console.error('Error downloading file:', err);
    res.status(404).json({ message: 'File not found' });
  }
};

// 🟢 Search bhajans
export const searchBhajans = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: 'Search query is required' });

    const bhajans = await prisma.bhajan.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { artist: { contains: query, mode: 'insensitive' } },
          { album: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json(bhajans);
  } catch (error) {
    console.error('Error searching bhajans:', error);
    res.status(500).json({ message: 'Failed to search bhajans', error: error.message });
  }
};
