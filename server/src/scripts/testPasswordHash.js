'use strict';

/**
 * server/src/scripts/testPasswordHash.js
 *
 * Usage:
 *   cd server
 *   node src/scripts/testPasswordHash.js
 */

const {
  hashPassword,
  comparePassword,
} = require('../security/password-security');

const main = async () => {
  const plainPassword = 'MyStrongPassword123!';

  const storedPasswordFields = await hashPassword(plainPassword, {
    iterations: 1000, // faster only for test
  });

  console.log('Stored fields:');
  console.log(storedPasswordFields);

  console.log('\nContains plaintext password:', Object.values(storedPasswordFields).includes(plainPassword));
  console.log('Has passwordHash:', Boolean(storedPasswordFields.passwordHash));
  console.log('Has passwordSalt:', Boolean(storedPasswordFields.passwordSalt));
  console.log('Has passwordIterations:', storedPasswordFields.passwordIterations);

  console.log('\nCorrect password:', await comparePassword(plainPassword, storedPasswordFields));
  console.log('Wrong password:', await comparePassword('WrongPassword123!', storedPasswordFields));

  console.log(
    '\nFinal success:',
    Boolean(storedPasswordFields.passwordHash) &&
      Boolean(storedPasswordFields.passwordSalt) &&
      storedPasswordFields.passwordIterations === 1000 &&
      (await comparePassword(plainPassword, storedPasswordFields)) === true &&
      (await comparePassword('WrongPassword123!', storedPasswordFields)) === false
  );
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});