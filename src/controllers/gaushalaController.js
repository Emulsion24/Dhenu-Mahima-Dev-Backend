import {prisma} from '../prisma/config.js';
import cloudinary from '../utils/cloudinary.js';
import fs from "fs/promises";

const parseContactDetails = (gs) => {
  const details = JSON.parse(gs.contactDetails || '{}');
  return { ...gs, phone: details.phone, email: details.email };
};


// GET /api/gaushalas
export const getAllGaushalas = async (req, res) => {
  try {
    const gaushalas = await prisma.gaushala.findMany({ orderBy: { createdAt: 'desc' } });
    const formatted = gaushalas.map(parseContactDetails);
    res.status(200).json({ success: true, data: formatted, count: formatted.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error fetching Gau Shalas', error: err.message });
  }
};

// GET /api/gaushalas/:id
export const getGaushalaById = async (req, res) => {
  try {
    const gaushala = await prisma.gaushala.findUnique({ where: { id: Number(req.params.id) } });
    if (!gaushala) return res.status(404).json({ success: false, message: 'Gau Shala not found' });
    res.status(200).json({ success: true, data: parseContactDetails(gaushala) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error fetching Gau Shala', error: err.message });
  }
};




// CREATE GAUSHALA
export const createGaushala = async (req, res) => {
    let uploadedFile = null;
          


      try {

        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        
        uploadedFile = req.file.path;
    
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "gaushalas",
          resource_type: "image",
        });
    
        // Delete local file after upload
        await fs.unlink(req.file.path);
        uploadedFile = null;
const { name, address, city, state, pincode, establishmentDate, totalCows, capacity, contactPerson, phone, email, description } = req.body;

    if (!name || !address || !city || !state || !pincode || !establishmentDate || !totalCows || !capacity || !contactPerson || !phone || !email) {
     return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const establishmentYear = new Date(establishmentDate).getFullYear();

    const newGaushala = await prisma.gaushala.create({
      data: {
        name,
        address,
        city,
        state,
        pincode:pincode,
        establishmentYear,
        totalCows: Number(totalCows),
        capacity: Number(capacity),
        contactPerson,
        contactDetails: JSON.stringify({ phone, email }),
        description: description || null,
        photo:result.secure_url || null,
      }
    });

    res.status(201).json({ success: true, message: 'Gau Shala created', data: parseContactDetails(newGaushala) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error creating Gau Shala', error: err.message });
  }
};

// UPDATE GAUSHALA
export const updateGaushala = async (req, res) => {
   let uploadedFile = null;
      
      try {

       
                   console.log(req.params.id)
        uploadedFile = req.file.path;
    
        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "gaushalas",
          resource_type: "image",
        });
    
        // Delete local file after upload
        await fs.unlink(req.file.path);
        uploadedFile = null;

    const { name, address, city, state, pincode, establishmentDate, totalCows, capacity, contactPerson, phone, email, description } = req.body;


     const gaushalaId = parseInt(req.params.id);
    const existing = await prisma.gaushala.findUnique({ where: { id: gaushalaId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Gau Shala not found' });

    const establishmentYear = new Date(establishmentDate).getFullYear();

    const updatedGaushala = await prisma.gaushala.update({
      where: { id: gaushalaId },
      data: {
        name,
        address,
        city,
        state,
        pincode,
        establishmentYear,
        totalCows: Number(totalCows),
        capacity: Number(capacity),
        contactPerson,
        contactDetails: JSON.stringify({ phone, email }),
        description: description || null,
        photo: result? result.secure_url : existing.photo
      }
    });

    res.status(200).json({ success: true, message: 'Gau Shala updated', data: parseContactDetails(updatedGaushala) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error updating Gau Shala', error: err.message });
  }
};


// DELETE /api/gaushalas/:id
export const deleteGaushala = async (req, res) => {
  try {
    const existing = await prisma.gaushala.findUnique({ where: { id: Number(req.params.id) } });
    if (!existing) return res.status(404).json({ success: false, message: 'Gau Shala not found' });

    await prisma.gaushala.delete({ where: { id: Number(req.params.id) } });
    res.status(200).json({ success: true, message: 'Gau Shala deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error deleting Gau Shala', error: err.message });
  }
};

// GET /api/gaushalas/statistics
export const getStatistics = async (req, res) => {
  try {
    const gaushalas = await prisma.gaushala.findMany();
    const totalGauShalas = gaushalas.length;
    const totalCows = gaushalas.reduce((sum, gs) => sum + gs.totalCows, 0);
    const totalCapacity = gaushalas.reduce((sum, gs) => sum + gs.capacity, 0);

    res.status(200).json({
      success: true,
      data: {
        totalGauShalas,
        totalCows,
        totalCapacity,
        avgCowsPerShala: totalGauShalas ? Math.round(totalCows / totalGauShalas) : 0,
        utilizationPercentage: totalCapacity ? ((totalCows / totalCapacity) * 100).toFixed(2) : 0
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error fetching statistics', error: err.message });
  }
};

// GET /api/gaushalas/search?q=
export const searchGaushalas = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ success: false, message: 'Search query is required' });

    const results = await prisma.gaushala.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { state: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } }
        ]
      }
    });

    res.status(200).json({ success: true, data: results.map(parseContactDetails), count: results.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error searching Gau Shalas', error: err.message });
  }
};
