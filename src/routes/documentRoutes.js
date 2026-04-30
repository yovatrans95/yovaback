const express = require('express');
const { protect, allowRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');
const { uploadGeneralDocument, uploadOfficialDocument } = require('../controllers/documentController');

const router = express.Router();

router.post('/:id/documents', protect, allowRoles('admin', 'gestionnaire'), upload.single('file'), uploadGeneralDocument);
router.post('/:id/official-documents/:type', protect, allowRoles('admin', 'gestionnaire'), upload.single('file'), uploadOfficialDocument);

module.exports = router;
