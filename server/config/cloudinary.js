/**
 * config/cloudinary.js
 * 
 * Configures the Cloudinary SDK using credentials stored in environmental variables.
 * Provides a configured instance of Cloudinary to upload/delete files.
 */

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary SDK
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Ensure uploads use HTTPS URLs
});

module.exports = cloudinary;
