import api from './api';

/**
 * client/src/services/beneficiaryService.js
 *
 * Feature 11 — Beneficiary Management.
 *
 *   GET    /api/beneficiary        → getMyBeneficiaries()
 *   POST   /api/beneficiary        → addBeneficiary(payload)
 *   PATCH  /api/beneficiary/:id    → updateBeneficiary(id, payload)
 *   DELETE /api/beneficiary/:id    → deleteBeneficiary(id)
 */

export const getMyBeneficiaries = () =>
  api.get('/beneficiary');

export const addBeneficiary = (payload) =>
  api.post('/beneficiary', payload);

export const updateBeneficiary = (id, payload) =>
  api.patch(`/beneficiary/${id}`, payload);

export const deleteBeneficiary = (id) =>
  api.delete(`/beneficiary/${id}`);
