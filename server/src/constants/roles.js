'use strict';

/**
 * ============================================================================
 * CONTRIBUTION: RBAC — Role Constants & Validation (Sifat)
 * ============================================================================
 *
 * Security Feature : ✔ Access Control (RBAC)
 * Responsibility   : RBAC — Central role definitions
 *
 * This file is the single source of truth for all role names used
 * throughout the platform. Keeping roles centralized prevents typos
 * and inconsistencies between middleware, services, and controllers.
 *
 * Key contributions in this file:
 *   1. ROLES              — Frozen enum of role identifiers:
 *                             • USER  ('user')  — Regular banking customer
 *                             • ADMIN ('admin') — Platform administrator
 *   2. ROLE_LIST          — Ordered array of valid role strings.
 *   3. ROLE_LABELS        — Human-readable labels for UI display.
 *   4. normalizeRole()    — Lowercases and trims role strings for safe
 *                            comparison across the codebase.
 *   5. isValidRole()      — Returns true if a string is a recognized role.
 *   6. assertValidRole()  — Throws if a role is not recognized (used during
 *                            registration and admin operations).
 * ============================================================================
 */

/**
 * server/src/constants/roles.js
 *
 * Central Role-Based Access Control constants.
 * Keep all role names lowercase because User.role stores lowercase values.
 */

const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
});

const ROLE_LIST = Object.freeze([
  ROLES.USER,
  ROLES.ADMIN,
]);

const ROLE_LABELS = Object.freeze({
  [ROLES.USER]: 'Regular User',
  [ROLES.ADMIN]: 'Administrator',
});

const normalizeRole = (role) => {
  return String(role || '').trim().toLowerCase();
};

const isValidRole = (role) => {
  return ROLE_LIST.includes(normalizeRole(role));
};

const assertValidRole = (role) => {
  const normalizedRole = normalizeRole(role);

  if (!isValidRole(normalizedRole)) {
    throw new Error(`Invalid role: ${role}`);
  }

  return normalizedRole;
};

module.exports = {
  ROLES,
  ROLE_LIST,
  ROLE_LABELS,
  normalizeRole,
  isValidRole,
  assertValidRole,
};