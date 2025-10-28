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

    // ✅ Decide folder dynamically based on the fieldname OR route
    if (file.fieldname === 'audio') folder = 'audio';
    else if (file.fieldname === 'image') {
      // 👇 if this upload is for a news route, save under /news
      if (req.baseUrl.includes('/news')) folder = 'news';
      else folder = 'images';
    } else if (file.fieldname === 'pdf') folder = 'others';

    const dir = path.join(uploadDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// File type filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (file.fieldname === 'audio') {
    const allowed = /mp3|wav|mpeg/;
    return allowed.test(ext) && allowed.test(mime)
      ? cb(null, true)
      : cb(new Error('Only audio files are allowed (mp3, wav, mpeg)'));
  }

  if (file.fieldname === 'image') {
    const allowed = /jpeg|jpg|png|gif|webp/;
    return allowed.test(ext) && allowed.test(mime)
      ? cb(null, true)
      : cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }

  if (file.fieldname === 'pdf') {
    const allowed = /pdf/;
    return allowed.test(ext) && allowed.test(mime)
      ? cb(null, true)
      : cb(new Error('Only PDF files are allowed'));
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // max 50MB
  fileFilter,
});
