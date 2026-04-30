const express = require('express');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/:key', protect, async (req, res) => {
  const file = await r2.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: req.params.key
    })
  );

  res.setHeader('Content-Type', file.ContentType || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');

  file.Body.pipe(res);
});

module.exports = router;