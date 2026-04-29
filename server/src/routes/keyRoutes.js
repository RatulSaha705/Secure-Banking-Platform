'use strict';

/**
 * server/src/routes/keyRoutes.js
 *
 * Feature 17 Key Management routes.
 * These routes are admin-only.
 */

const express = require('express');
const keyController = require('../controllers/keyController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuth);
router.use(requireAdmin);

router.get('/', keyController.listKeys);
router.post('/', keyController.createKey);
router.post('/ensure-initial', keyController.ensureInitialKeys);
router.post('/ensure-user', keyController.ensureUserKeys);
router.post('/rotate', keyController.rotateKey);
router.patch('/:keyId/retire', keyController.retireKey);
router.patch('/:keyId/compromised', keyController.markKeyCompromised);

module.exports = router;