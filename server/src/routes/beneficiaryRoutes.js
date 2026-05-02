'use strict';

/**
 * server/src/routes/beneficiaryRoutes.js
 *
 * Feature 11 — Beneficiary Management routes.
 * Mount point (app.js): /api/beneficiary
 *
 *   GET    /api/beneficiary        – List my beneficiaries
 *   POST   /api/beneficiary        – Add a beneficiary (max 5)
 *   PATCH  /api/beneficiary/:id    – Update name / nickname / contact
 *   DELETE /api/beneficiary/:id    – Remove a beneficiary
 *
 * All routes require a valid Bearer access token (requireAuth).
 */

const express = require('express');
const router  = express.Router();

const {
  listHandler,
  addHandler,
  updateHandler,
  deleteHandler,
} = require('../controllers/beneficiaryController');

const { requireAuth } = require('../middleware/authMiddleware');

router.get   ('/',    requireAuth, listHandler);
router.post  ('/',    requireAuth, addHandler);
router.patch ('/:id', requireAuth, updateHandler);
router.delete('/:id', requireAuth, deleteHandler);

module.exports = router;
