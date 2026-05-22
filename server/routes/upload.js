/**
 * upload.js
 * 
 * Express routing handler for managing secure file uploads via Cloudinary.
 * Receives files in-memory using Multer and streams them directly to Cloudinary.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('../config/cloudinary');
const authMiddleware = require('../middleware/auth');

const path = require('path');
const fs = require('fs');

// Configure Memory Storage to receive file as a Buffer
const storage = multer.memoryStorage();

// Filter file types strictly
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/wav',
    'video/mp4',
    'video/quicktime'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, audio, and videos are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  },
  fileFilter
});

/**
 * Reusable utility to upload a file buffer directly to Cloudinary.
 */
const uploadToCloudinary = (fileBuffer, folder, mimeType) => {
  return new Promise((resolve, reject) => {
    // Determine the resource type (image, video, raw) from the mimeType
    let resourceType = 'auto';
    if (mimeType.startsWith('video/')) {
      resourceType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      resourceType = 'video'; // Cloudinary handles audio files as 'video' resource type
    } else if (mimeType.startsWith('image/')) {
      resourceType = 'image';
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `vibespace/${folder}`,
        resource_type: resourceType
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        resolve(result);
      }
    );

    // Convert Buffer to Readable stream and pipe to Cloudinary upload stream
    Readable.from(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Fallback helper to save files locally on the server and return the absolute server URL.
 */
const saveLocalFallback = (req, file) => {
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  let ext = path.extname(file.originalname) || '';
  if (!ext) {
    const mimeParts = file.mimetype.split('/');
    ext = mimeParts[1] ? `.${mimeParts[1]}` : '.jpg';
  }
  const filename = `${uniqueSuffix}${ext}`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFileSync(filepath, file.buffer);

  // Construct absolute URL
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${host}/uploads/${filename}`;
};

// General media upload (profiles, posts, chats)
router.post('/image', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    try {
      // Try Cloudinary first
      const folder = req.file.mimetype.startsWith('image/') ? 'general' : 'media';
      const uploadResult = await uploadToCloudinary(req.file.buffer, folder, req.file.mimetype);
      return res.json({ success: true, data: uploadResult.secure_url });
    } catch (cloudinaryError) {
      console.warn('Cloudinary upload failed, falling back to local server storage:', cloudinaryError.message || cloudinaryError);
      const localUrl = saveLocalFallback(req, req.file);
      return res.json({ success: true, data: localUrl });
    }
  } catch (error) {
    console.error('Upload route error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Stories upload
router.post('/story', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    try {
      // Try Cloudinary first
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'stories', req.file.mimetype);
      return res.json({ success: true, data: uploadResult.secure_url });
    } catch (cloudinaryError) {
      console.warn('Cloudinary story upload failed, falling back to local server storage:', cloudinaryError.message || cloudinaryError);
      const localUrl = saveLocalFallback(req, req.file);
      return res.json({ success: true, data: localUrl });
    }
  } catch (error) {
    console.error('Upload route error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Multer specific error handling interceptor
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: `Upload limit error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
  next();
});

module.exports = router;
