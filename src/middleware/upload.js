import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Storage & filter
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder = 'others';
    if (file.fieldname === 'audio') folder = 'audio';
    if (file.fieldname === 'image') folder = 'images';
    const dir = path.join(uploadDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'audio') {
    const allowed = /mp3|wav|mpeg/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only audio files are allowed (mp3, wav, mpeg)'));
  } else if (file.fieldname === 'image') {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) return cb(null, true);
    return cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // max 50MB
  fileFilter,
});
