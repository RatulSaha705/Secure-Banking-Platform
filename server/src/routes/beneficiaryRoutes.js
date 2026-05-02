'use strict';

/**
 * server/src/routes/beneficiaryRoutes.js
 *
 * Feature 11 — Beneficiary Management routes.
 *
 * RBAC:
 *   Regular users can manage their own beneficiaries.
 *   Admins are blocked from user beneficiary operations.
 */

const express = require('express');

const router = express.Router();

const {
  listHandler,
  addHandler,
  updateHandler,
  deleteHandler,
} = require('../controllers/beneficiaryController');

const {
  requireAuth,
  requireUser,
} = require('../middleware/authMiddleware');

router.use(requireAuth);
router.use(requireUser);

router.get('/', listHandler);
router.post('/', addHandler);
router.patch('/:id', updateHandler);
router.delete('/:id', deleteHandler);

module.exports = router;