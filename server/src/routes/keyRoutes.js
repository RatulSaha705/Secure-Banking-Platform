'use strict';

/**
 * server/src/routes/keyRoutes.js
 *
 * Feature 17 Key Management routes.
 *
 * IMPORTANT:
 * Protect these routes with admin-only middleware before real use.
 */

const express = require('express');
const keyController = require('../controllers/keyController');

const router = express.Router();

const blockUntilAdminMiddlewareIsConnected = (req, res) => {
  return res.status(403).json({
    success: false,
    message:
      'Key management routes are installed but blocked. Connect admin RBAC middleware before enabling.',
  });
};

// Keep this line active until your admin auth middleware is ready.
// Comment it out only after adding real admin protection.
router.use(blockUntilAdminMiddlewareIsConnected);

router.get('/', keyController.listKeys);
router.post('/', keyController.createKey);
router.post('/ensure-initial', keyController.ensureInitialKeys);
router.post('/ensure-user', keyController.ensureUserKeys);
router.post('/rotate', keyController.rotateKey);
router.patch('/:keyId/retire', keyController.retireKey);
router.patch('/:keyId/compromised', keyController.markKeyCompromised);

module.exports = router;