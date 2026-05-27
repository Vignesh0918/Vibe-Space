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

// General media upload (profiles, posts, chats)
router.post('/image', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const folder = req.file.mimetype.startsWith('image/') ? 'general' : 'media';
    const uploadResult = await uploadToCloudinary(req.file.buffer, folder, req.file.mimetype);
    return res.json({ success: true, data: uploadResult.secure_url });
  } catch (error) {
    console.warn('Cloudinary upload failed, falling back to Base64 database-only storage:', error.message || error);
    // Convert Buffer to Base64 Data URI to store inside the database URL field
    const base64Data = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
    return res.json({ success: true, data: dataUri });
  }
});

// Stories upload
router.post('/story', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, 'stories', req.file.mimetype);
    return res.json({ success: true, data: uploadResult.secure_url });
  } catch (error) {
    console.warn('Cloudinary story upload failed, falling back to Base64 database-only storage:', error.message || error);
    // Convert Buffer to Base64 Data URI to store inside the database URL field
    const base64Data = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64Data}`;
    return res.json({ success: true, data: dataUri });
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
