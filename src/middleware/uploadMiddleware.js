const multer = require('multer');
const multerS3 = require('multer-s3');
const crypto = require('crypto');
const path = require('path');
const r2 = require('../config/r2');

const storage = multerS3({
  s3: r2,
  bucket: process.env.R2_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

module.exports = multer({ storage });