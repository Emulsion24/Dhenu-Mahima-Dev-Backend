import {prisma} from "../prisma/config.js";
import cloudinary from '../utils/cloudinary.js';
import fs from "fs/promises";

// Create a new GopalPariwar
export const createGopal = async (req, res) => {
  let uploadedFile = null;
    
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    
      uploadedFile = req.file.path;
  
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "gopalpariwar",
        resource_type: "image",
      });
  
      // Delete local file after upload
      await fs.unlink(req.file.path);
      uploadedFile = null;
  
    const { heroTitle, responsibilities, heroSubtitle,personalInfo, lifeJourney,pledges,spiritualEducation} = req.body;





const newGopal= await prisma.gopalPariwar.create({
  data: {
    heroImage:result.secure_url,
    heroTitle,
    heroSubtitle,
    personalInfo,       // Json field, OK
    spiritualEducation: JSON.stringify(spiritualEducation), // <-- stringify
    lifeJourney,
    responsibilities,
    pledges
  }
});

    res.status(201).json(newGopal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create GopalPariwar data" });
  }
};

// Get all GopalPariwar
export const getAllGopal = async (req, res) => {
  try {
    const gopals = await prisma.gopalPariwar.findMany();
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
  const { heroImage, heroTitle, heroSubtitle, personalInfo, spiritualEducation, lifeJourney, responsibilities, pledges } = req.body;

  try {
    const updatedGopal = await prisma.gopalPariwar.update({
      where: { id: parseInt(id) },
      data: { heroImage, heroTitle, heroSubtitle, personalInfo, spiritualEducation, lifeJourney, responsibilities, pledges },
    });
    res.status(200).json(updatedGopal);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update data" });
  }
};

// Delete GopalPariwar
export const deleteGopal = async (req, res) => {
  const id = parseInt(req.params.id);

  

  try {
    await prisma.gopalPariwar.delete({ where: { id: id } });
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete data" });
  }
};
