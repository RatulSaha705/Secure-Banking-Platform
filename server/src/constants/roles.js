'use strict';

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