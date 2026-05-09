# Secure Banking Platform - Security Features Documentation
## For VIVA Examination

---

## Table of Contents
1. [MAC (CBC-MAC) - Data Integrity](#1-mac-cbc-mac---data-integrity)
2. [RBAC (Role-Based Access Control)](#2-rbac-role-based-access-control)
3. [Session Management & Security](#3-session-management--security)
4. [Security Architecture Flow](#4-security-architecture-flow)

---

## 1. MAC (CBC-MAC) - Data Integrity

### Overview
The CBC-MAC (Cipher Block Chaining - Message Authentication Code) engine provides data integrity verification for all sensitive records stored in MongoDB. Every record tagged with a CBC-MAC can detect any unauthorized modification.

### Security Feature: ✔ Data Integrity (MAC)

**Purpose**: Guarantee that sensitive data has not been tampered with or corrupted.

### Implementation

#### Core Engine File
**Location**: `server/src/security/data-integrity/cbc-mac-engine.js`

**Key Functions and Line Numbers:**

| Function | Lines | Purpose |
|----------|-------|---------|
| `deriveCbcMacKey()` | 73-82 | Derives a 128-bit AES key from the master secret via SHA-256 (first 16 bytes) |
| `padMessage()` | 89-104 | Zero-pads the message to AES block size with 4-byte length prefix (ISO/IEC 9797-1 Padding Method 1) |
| `cbcMacBuffer()` | 111-136 | Core MAC computation: AES-128-CBC encrypt with zero IV, returns last 16-byte ciphertext block |
| `cbcMacHex()` | 144-146 | Computes CBC-MAC and returns result as hex string (32 chars) |
| `timingSafeEqualHex()` | 153-163 | Constant-time comparison of hex MAC tags to prevent timing side-channel attacks |
| `createCbcMac()` | 170-183 | High-level helper that canonicalizes record parts and computes CBC-MAC tag |
| `verifyCbcMac()` | 191-194 | Verifies a previously created CBC-MAC tag using timing-safe comparison |

### How CBC-MAC Works

```
1. Key Derivation (Line 73-82):
   ├─ Input: Master secret (env string)
   ├─ Process: SHA-256 hash
   └─ Output: 16-byte AES-128 key

2. Message Padding (Line 89-104):
   ├─ Prepend: 4-byte big-endian length prefix
   ├─ Append: Zero-padding to AES block size (16 bytes)
   └─ Result: Block-aligned message preventing length attacks

3. CBC-MAC Computation (Line 111-136):
   ├─ IV: All-zero (ZERO_IV, Line 70)
   ├─ Cipher: AES-128-CBC
   ├─ Process: Encrypt padded message
   └─ Extract: Last 16-byte block as MAC tag

4. Verification (Line 191-194):
   ├─ Recompute: MAC for received data
   ├─ Compare: Using timing-safe function
   └─ Result: Boolean (match/no match)
```

### Security Mechanisms

**Line 153-163: Constant-Time Comparison**
- Prevents timing side-channel attacks
- Uses Node.js built-in `crypto.timingSafeEqual()`
- Compares equal-length buffers without early exit

**Line 89-104: Length Prefix Protection**
- 4-byte length prepended before padding
- Prevents variable-length message attacks
- Makes scheme resistant to forgery of different lengths

**Line 70: Zero IV Configuration**
- CBC-MAC standard uses all-zero IV
- Never randomized (deterministic for same input)
- Allows consistent tag generation

### Integration with Storage

**Location**: `server/src/security/data-integrity/integrity-checker.js`

Used by storage layer to attach MAC to encrypted fields:
- Every encrypted field gets a CBC-MAC tag
- Tag stored alongside encrypted data
- Verified on every read operation

### Database Records with MAC

**Models that use MAC verification:**
- `User.js` (Line 1-50): Credentials + metadata
- `RefreshSession.js` (Line 1-50): Session data
- `Account.js`: Account balance
- `Transaction.js`: Transfer history
- `Beneficiary.js`: Beneficiary information

---

## 2. RBAC (Role-Based Access Control)

### Overview
RBAC enforces granular access control by assigning roles to users and checking permissions at the middleware level. Only authorized users can access specific resources.

### Security Feature: ✔ Access Control (RBAC)

**Purpose**: Restrict API endpoints and operations based on user role.

### Implementation

#### Role Constants Definition
**Location**: `server/src/constants/roles.js`

| Function/Constant | Lines | Purpose |
|----------|-------|---------|
| `ROLES` | 47-50 | Enum of role identifiers (USER, ADMIN) |
| `ROLE_LIST` | 52-55 | Array of valid role strings |
| `ROLE_LABELS` | 57-62 | Human-readable labels for UI |
| `normalizeRole()` | 64-66 | Lowercases and trims role for safe comparison |
| `isValidRole()` | 68-70 | Returns true if role is recognized |
| `assertValidRole()` | 72-81 | Throws error if role is invalid |

**Available Roles:**
```javascript
ROLES = {
  USER: 'user',      // Regular banking customer
  ADMIN: 'admin'     // Platform administrator
}
```

#### RBAC Middleware
**Location**: `server/src/middleware/authMiddleware.js`

| Function | Lines | Purpose |
|----------|-------|---------|
| `isAdminRole()` | 90-92 | Checks if user has admin role |
| `isUserRole()` | 94-96 | Checks if user has regular user role |
| `requireAuth()` | 129-204 | Full auth pipeline: token validation + session verification |
| `requireRole()` | N/A | Middleware factory for role checking |
| `requireAdmin()` | N/A | Shortcut for requireRole('admin') |
| `requireOwnerOrAdmin()` | N/A | Ownership-based access control |

### RBAC Enforcement Pipeline

**File**: `server/src/middleware/authMiddleware.js` (Lines 129-204)

```
1. Extract Bearer Token (Line 143-145):
   ├─ Source: Authorization header
   ├─ Format: "Bearer <token>"
   └─ Validation: Token must exist

2. Verify JWT Signature (Line 147):
   ├─ Algorithm: HS256
   ├─ Secret: JWT_ACCESS_SECRET
   ├─ Extract: userId, role, sessionId
   └─ Expiry: Checked (default 15 minutes)

3. Load Encrypted Session (Line 152-159):
   ├─ Query: RefreshSession by sessionId
   ├─ Decrypt: All fields using storage engine
   ├─ Validate: Status = 'ACTIVE'
   └─ Check: Session not expired

4. Session Expiry Validation (Line 161-175):
   ├─ Check: Session expiry (7 days default, Line 39)
   ├─ Check: Idle timeout (5 minutes, Line 40)
   ├─ Auto-revoke: If expired
   └─ Response: 401 Unauthorized if invalid

5. User Verification (Line 180-186):
   ├─ Load: Encrypted user document
   ├─ Decrypt: All user fields
   ├─ Validate: User is active (isActive = true)
   └─ Extract: User role

6. Populate Request Context (Line 188-194):
   ├─ req.user = { id, role, sessionId, email, ... }
   ├─ req.auth = { accessToken, sessionId }
   └─ Pass to downstream handlers

7. Role-Based Route Protection (Lines TBD in requireRole):
   ├─ Check: req.user.role matches required role
   ├─ Response: 403 Forbidden if no match
   └─ Continue: If authorized
```

### Role-Based Route Protection

**Protected Endpoints by Role:**

```
Admin Routes (/admin/...):
├─ requireAuth + requireAdmin
├─ Admin Panel: /api/admin/panel
├─ User Management: /api/admin/users
└─ Support Tickets: /api/admin/support-tickets

User Routes (/user/...):
├─ requireAuth + requireUser
├─ Account: /api/account/balance
├─ Transfer: /api/transfer
├─ Beneficiary: /api/beneficiary
├─ Dashboard: /api/dashboard
└─ Profile: /api/profile

Mixed Routes (User OR Admin):
├─ requireAuth (role flexible)
├─ Notifications: /api/notifications
├─ Profile View: /api/profile/view
└─ Support Tickets (user): /api/support-tickets
```

### Security Mechanisms

**Line 90-92: Role Normalization**
```javascript
const isAdminRole = (role) => {
  return normalizeRole(role) === ROLES.ADMIN;
};
```
- Prevents role injection via case variation
- All roles stored lowercase in database
- Case-insensitive comparison

**Line 161-175: Session Expiry Protection**
```javascript
if (isExpired(session.expiresAt)) {
  // Auto-revoke expired sessions
  await revokeSessionById({ sessionId: decoded.sid, reason: 'SESSION_EXPIRED' });
  return sendUnauthorized(res, 'Session expired');
}
```
- Sessions automatically revoked if expired
- Prevents replay attacks with old tokens
- Audit trail recorded (revokedReason)

**Line 168-175: Idle Timeout Protection**
```javascript
if (session.idleExpiresAt && isExpired(session.idleExpiresAt)) {
  await revokeSessionById({ sessionId: decoded.sid, reason: 'IDLE_TIMEOUT' });
  return sendUnauthorized(res, 'Session ended because of inactivity');
}
```
- Automatically logs out inactive users
- Default: 5 minutes (Line 40, configurable)
- Frontend enforces same timeout (Line 19 in AuthContext.js)

**Line 152-159: Session-User Matching**
```javascript
if (!sameId(session.userId, decoded.id)) {
  await revokeSessionById({
    sessionId: decoded.sid,
    reason: 'SESSION_USER_MISMATCH',
  });
  return sendUnauthorized(res, 'Session does not match authenticated user');
}
```
- Prevents session hijacking
- Validates token user matches session owner
- Revokes mismatched sessions

---

## 3. Session Management & Security

### Overview
Session management handles the lifecycle of user authentication: creation, rotation, activity tracking, and revocation. All session data is fully encrypted in MongoDB.

### Security Feature: ✔ Session Security

**Purpose**: Maintain secure, encrypted, and auditable user sessions with automatic expiry and idle timeout.

### Implementation

#### Token Service (Core Session Engine)
**Location**: `server/src/services/tokenService.js`

| Function | Lines | Purpose |
|----------|-------|---------|
| `generateRefreshToken()` | 133 | Creates 48-byte random refresh token (base64url) |
| `hashRefreshToken()` | 135-139 | Hashes refresh token using CBC-MAC (never stored in plaintext) |
| `generateAccessToken()` | 141-151 | Signs JWT (HS256) with userId, role, sessionId (15m expiry) |
| `verifyAccessToken()` | 153 | Verifies JWT signature and expiry |
| `createLoginSession()` | 206-240 | Creates new encrypted session after successful login |
| `rotateRefreshSession()` | 243-290 | Implements token rotation: invalidates old, creates new |
| `touchSessionActivity()` | N/A | Extends idle timeout on user activity |
| `revokeSessionById()` | N/A | Revokes session by ID (cleanup) |

#### Session Configuration
**File**: `server/src/services/tokenService.js`

| Config | Lines | Default | Purpose |
|--------|-------|---------|---------|
| `DEFAULT_ACCESS_EXPIRES_IN` | 33 | 15m | JWT access token lifetime |
| `DEFAULT_REFRESH_EXPIRES_IN_DAYS` | 34 | 7 days | Refresh session lifetime |
| `DEFAULT_IDLE_TIMEOUT_MINUTES` | 35 | 5 min | Idle logout timeout |

#### Session Model (Storage Schema)
**Location**: `server/src/models/RefreshSession.js`

**Encrypted Fields:**
```javascript
- userId              // Session owner
- refreshTokenHash    // CBC-MAC hash of refresh token
- status              // 'ACTIVE', 'EXPIRED', 'REVOKED'
- ipAddress           // Client IP (fingerprinting)
- userAgent           // Browser/device info (fingerprinting)
- lastUsedAt          // Last token use timestamp
- lastActivityAt      // Last user activity timestamp
- idleExpiresAt       // When idle timeout occurs
- expiresAt           // When session expires (7 days)
- revokedAt           // Revocation timestamp
- revokedReason       // Why revoked (EXPIRED, IDLE_TIMEOUT, USER_INACTIVE, etc.)
- replacedBySessionId // Next session in rotation chain
- createdAt           // Session creation time
- updatedAt           // Last update time
```

**Only _id is readable** (MongoDB index for lookups)

### Session Lifecycle

#### 1. Session Creation (Login)
**File**: `server/src/services/tokenService.js` (Lines 206-240)

```
POST /api/auth/login → authController.login()
    ↓
authService.loginUser()
    ↓
Verify credentials (password hash comparison)
    ↓
Create OTP challenge
    ↓
Return: { pendingUser, challenge, email }

User enters OTP:
    ↓
POST /api/auth/verify-login-otp → authController.verifyLogin()
    ↓
tokenService.createLoginSession() (Line 206):
    
1. Generate refresh token (48 bytes, Line 210):
   refreshToken = crypto.randomBytes(48).toString('base64url')

2. Hash refresh token (Line 211):
   refreshTokenHash = createCbcMac(JWT_REFRESH_SECRET, ['...', refreshToken])
   └─ CBC-MAC used for constant-time comparison later

3. Create session object (Lines 213-232):
   {
     _id: sessionId,
     userId: userId,
     refreshTokenHash: hashedToken,
     status: 'ACTIVE',
     ipAddress: getRequestIp(req),        // Line 109
     userAgent: getRequestUserAgent(req), // Line 114
     lastUsedAt: now,
     lastActivityAt: now,
     idleExpiresAt: now + 5 min,          // Line 39
     expiresAt: now + 7 days,             // Line 34
     createdAt: now,
     updatedAt: now,
     revokedAt: null,
     revokedReason: null
   }

4. Encrypt session (Line 235):
   encrypted = encryptSensitiveFields('REFRESH_SESSION', session)

5. Save to MongoDB (Line 236):
   RefreshSession.create(encrypted)

6. Generate tokens (Lines 238-239):
   accessToken = JWT.sign(
     { id, role, sid },
     JWT_ACCESS_SECRET,
     { expiresIn: '15m' }  // Short-lived
   )
   refreshToken = plaintext (sent to client)

7. Return to client:
   {
     accessToken: "eyJhbGc...",      // For API calls (15m)
     refreshToken: "dGh1c2...",      // In httpOnly cookie (7d)
     sessionId: "a1b2c3d4e5f6g7h8",
     expiresAt: ISO timestamp,
     idleExpiresAt: ISO timestamp
   }
```

#### 2. Session Usage (Protected API Call)
**File**: `server/src/middleware/authMiddleware.js` (Lines 129-204)

```
Client calls protected endpoint:
GET /api/dashboard
    ↓
Authorization: Bearer <accessToken>
    ↓
Browser includes cookie: securebank_refresh=<refreshToken>
    ↓
requireAuth middleware (Line 129):
    
1. Extract Bearer token (Line 143-145)
2. Verify JWT (Line 147)
   ├─ Signature validation
   ├─ Expiry check
   └─ Extract: { id, role, sid }
   
3. Load encrypted session from MongoDB (Line 152)
   RefreshSession.findById(sid)
   
4. Decrypt session (Line 157):
   decryptSensitiveFields('REFRESH_SESSION', encSession)
   
5. Validate session (Lines 161-175):
   ├─ status === 'ACTIVE'
   ├─ !isExpired(expiresAt)
   ├─ !isExpired(idleExpiresAt)
   └─ userId matches token
   
6. Load & decrypt user (Line 180):
   User.findById(id)
   decryptSensitiveFields('USER', encUser)
   
7. Populate request context (Lines 188-194):
   req.user = { id, role, sessionId, email, ... }
   
8. Continue to controller ✓
```

#### 3. Token Rotation (Refresh)
**File**: `server/src/services/tokenService.js` (Lines 243-290)

```
POST /api/auth/refresh
    ↓
Sends: Cookie: securebank_refresh=<refreshToken>
    ↓
tokenService.rotateRefreshSession() (Line 243):
    
1. Hash provided refresh token (Line 244):
   providedHash = createCbcMac(JWT_REFRESH_SECRET, ['...', refreshToken])

2. Load ALL sessions from MongoDB (Line 245):
   allSessions = RefreshSession.find({})

3. Find matching session (Lines 247-253):
   for each session:
     - Decrypt session
     - Compare hash using timingSafeEqualHex() (timing-safe)
     - Break on match
   └─ Prevents timing attacks on token lookup

4. Validate current session (Line 255):
   assertActiveSession(currentSession)
   ├─ Check status = 'ACTIVE'
   ├─ Check not expired
   ├─ Check not idle-expired
   └─ Throw 401 if invalid

5. Create NEW session (Lines 267-283):
   nextSession = {
     userId: userId,
     refreshTokenHash: CBC-MAC(newRefreshToken),
     status: 'ACTIVE',
     ...
   }

6. Mark old session as replaced (not shown):
   currentSession.replacedBySessionId = nextSessionId

7. Revoke old session (Line 284):
   oldSession.status = 'REVOKED'
   oldSession.revokedReason = 'REPLACED_BY_TOKEN_ROTATION'

8. Save both sessions encrypted

9. Generate new tokens:
   accessToken (15m)
   refreshToken (new, 7 day chain)

10. Return to client:
    { accessToken, refreshToken, sessionId }
    └─ Client updates cookies + headers
```

#### 4. Session Termination (Logout)
**File**: `server/src/services/tokenService.js`

```
POST /api/auth/logout
    ↓
tokenService.revokeRefreshSession(refreshToken):
    
1. Hash provided refresh token
2. Find matching session (same as rotate)
3. Mark status = 'REVOKED'
4. Set revokedReason = 'USER_LOGOUT'
5. Set revokedAt = now
6. Save encrypted to MongoDB

7. Clear refresh cookie (httpOnly):
   res.clearCookie('securebank_refresh')

8. Client clears accessToken from memory

Result: Session completely terminated
```

### Frontend Session Management
**Location**: `client/src/context/AuthContext.js`

| State/Hook | Lines | Purpose |
|-----------|-------|---------|
| `AuthContext` | 13 | Global auth context |
| `AuthProvider` | 15 | Wrapper component |
| `currentUser` | 19 | Current logged-in user |
| `accessToken` | 20 | Current JWT access token |
| `isAuthenticated` | 21 | Boolean auth state |
| `useAuth()` hook | N/A | Hook to access auth context |

#### Frontend Idle Timeout Implementation
**Lines 19, 52-87, 89-107:**

```javascript
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;  // Line 19: 5 minutes

resetIdleTimer() (Line 52-61):
├─ Clear existing timeout
├─ Set new timeout for IDLE_TIMEOUT_MS
└─ On expiry: forceIdleLogout()

forceIdleLogout() (Line 75-82):
├─ Call: logout({ redirectToLogin: true, reason: 'idle-timeout' })
├─ Clear: accessToken from memory
├─ Call: logoutUser() (backend revocation)
└─ Redirect: window.location.assign('/login?reason=idle-timeout')

handleUserActivity() (Line 95-100):
├─ Triggered: On user interaction (mouse, keyboard, etc.)
├─ Sync: recordSessionActivity() → extends backend idleExpiresAt
└─ Reset: Frontend idle timer

syncActivityWithServer() (Line 85-92):
├─ Throttled: Only sync every 2 minutes (Line 18)
├─ Call: recordSessionActivity() API
└─ Purpose: Keep backend idleExpiresAt fresh
```

#### Token Refresh Interceptor
**Location**: `client/src/services/api.js`

- Intercepts 401 responses
- Automatically calls refreshSession()
- Retries original request with new accessToken
- Prevents unnecessary logouts

### Security Mechanisms

**1. Refresh Token Storage (httpOnly Cookie)**
```javascript
// Line 125-130 in tokenService.js
const buildCookieOptions = () => ({
  httpOnly: true,      // Cannot access via JavaScript
  secure: prod,        // HTTPS only in production
  sameSite: prod ? 'strict' : 'lax',  // CSRF protection
  path: '/api/auth',   // Only sent to auth endpoints
  maxAge: getRefreshMaxAgeMs()
});
```
- **httpOnly**: Prevents XSS token theft
- **secure**: Only transmitted over HTTPS
- **sameSite**: CSRF protection
- **path**: Limits cookie scope

**2. CBC-MAC Hashing of Refresh Token**
```javascript
// Line 135-139
const hashRefreshToken = (token) =>
  createCbcMac(
    getRefreshSecret(),
    ['secure-banking-refresh-v1', String(token)]
  );
```
- Refresh token never stored in plaintext
- Even database breach cannot yield token
- Constant-time comparison prevents timing attacks

**3. Session Fingerprinting (Lines 109, 114)**
```javascript
const ipAddress = getRequestIp(req);         // Capture IP
const userAgent = getRequestUserAgent(req);  // Capture browser
```
- Detects session hijacking
- Can alert if request from different location
- Future: Add IP/UA validation on session use

**4. Dual Timeout Protection**
```
Session Expiry (7 days):    Hard limit on session lifetime
Idle Timeout (5 minutes):   Logout if user inactive
JWT Access Expiry (15 min): Short-lived token for API calls
```
- Multiple layers of protection
- Cascading validation prevents zombie sessions

**5. Automatic Session Revocation**
```javascript
// Lines 161-175 in authMiddleware.js
- Expired: Auto-revoke on timeout
- Mismatched: Auto-revoke if user doesn't match
- Inactive User: Auto-revoke if user deactivated
- Audit: All revocations logged with reason
```

**6. Session Rotation (Token Refresh)**
```
Old Token Valid?
├─ NO → Reject (401)
├─ YES → Create NEW session
          Mark OLD as replaced
          Return NEW token
```
- Limits window for token compromise
- Audit chain: Can trace session replacements

---

## 4. Security Architecture Flow

### Complete Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER REGISTRATION                         │
└─────────────────────────────────────────────────────────────────┘

1. Frontend: RegisterPage.jsx
   └─ User enters: email, username, password

2. Call: authService.registerUser()
   └─ POST /api/auth/register

3. Backend: authController.register() → authService.registerUser()
   ├─ Validate: Email format, username length, password strength
   ├─ Hash Password: PBKDF2-SHA256, 200k iterations
   │  └─ security/password-security/password-service.js
   ├─ Generate OTP: Random 6-digit code
   ├─ Store: PendingRegistration (encrypted)
   │  └─ All fields encrypted except _id
   ├─ Send: Email with OTP
   └─ Return: { pendingUser, challengeId }

4. Frontend: RegisterPage → OTP input
   └─ User enters: OTP from email

5. Call: authService.verifyRegistrationOtp()
   └─ POST /api/auth/verify-registration-otp

6. Backend: authController.verifyRegistration()
   ├─ Load: PendingRegistration document
   ├─ Verify: OTP matches (PBKDF2 hash comparison)
   ├─ Create: User document
   │  ├─ _id: ObjectId
   │  ├─ encrypted fields: username, email, passwordHash, role, etc.
   │  └─ Storage: Only _id readable
   ├─ Create: Beneficiary (self) for transfers
   ├─ Create: Account (zero balance)
   ├─ Cleanup: Delete PendingRegistration
   └─ Return: { user, message }

7. Frontend: Redirect to LoginPage


┌─────────────────────────────────────────────────────────────────┐
│                           USER LOGIN                             │
└─────────────────────────────────────────────────────────────────┘

1. Frontend: LoginPage.jsx
   └─ User enters: email, password

2. Call: authService.loginUser()
   └─ POST /api/auth/login

3. Backend: authController.login() → authService.loginUser()
   ├─ Find: User by email (lookup hash)
   ├─ Decrypt: User document
   ├─ Compare: Password using PBKDF2
   ├─ Generate: OTP for 2FA
   ├─ Store: TwoFactorChallenge (encrypted)
   │  └─ Includes: userId, otpHash, status, attempts, expiresAt
   ├─ Send: Email with OTP
   └─ Return: { pendingUser, challengeId, email }

4. Frontend: Show OTP input field
   └─ User enters: OTP from email

5. Call: authService.verifyLoginOtp()
   └─ POST /api/auth/verify-login-otp

6. Backend: authController.verifyLogin()
   ├─ Load: TwoFactorChallenge (encrypted)
   ├─ Verify: OTP matches
   ├─ Check: Not expired, not max attempts
   ├─ Create: RefreshSession (Line 206, tokenService.js)
   │  ├─ Encrypt ALL fields except _id
   │  ├─ CBC-MAC hash refresh token
   │  ├─ Store: ipAddress, userAgent (fingerprinting)
   │  ├─ Set: idleExpiresAt = now + 5 min
   │  ├─ Set: expiresAt = now + 7 days
   │  └─ DB: RefreshSession collection
   ├─ Generate: JWT Access Token (15m, HS256)
   ├─ Set: httpOnly refresh cookie
   ├─ Create: Notification (login alert)
   └─ Return: { accessToken, refreshToken, user, expiresAt }

7. Frontend: AuthContext.setCurrentUser()
   ├─ Store: currentUser (from response)
   ├─ Store: accessToken (in memory)
   ├─ Call: setAccessTokenForApi(token)
   ├─ Start: Idle timer (5 min, Line 19 AuthContext.js)
   └─ Redirect: Dashboard


┌─────────────────────────────────────────────────────────────────┐
│                    PROTECTED API REQUEST                         │
└─────────────────────────────────────────────────────────────────┘

1. Frontend: Call protected endpoint
   └─ GET /api/dashboard

2. Interceptor (api.js):
   ├─ Get: accessToken from memory
   ├─ Add: Authorization: Bearer <accessToken>
   ├─ Include: Cookie: securebank_refresh=<token>
   └─ Send: Request

3. Backend: Middleware requireAuth (Line 129, authMiddleware.js):
   
   Step 1 - Extract Token:
   ├─ Get: Authorization header
   ├─ Parse: Bearer token
   ├─ Validate: Not empty
   └─ Return: 401 if missing
   
   Step 2 - Verify JWT:
   ├─ Algorithm: HS256
   ├─ Secret: JWT_ACCESS_SECRET
   ├─ Extract: { id, role, sid }
   ├─ Check: Not expired (15m)
   └─ Return: 401 if invalid/expired
   
   Step 3 - Load & Decrypt Session:
   ├─ Query: RefreshSession.findById(sid)
   ├─ Decrypt: All fields
   ├─ Get: userId, refreshTokenHash, status, etc.
   └─ Return: 401 if not found
   
   Step 4 - Validate Session Status:
   ├─ Check: status === 'ACTIVE'
   ├─ Check: Not expired (7 days)
   ├─ Check: Not idle-expired (5 min)
   ├─ Auto-revoke: If any check fails
   └─ Return: 401 if invalid
   
   Step 5 - User Validation:
   ├─ Query: User.findById(id)
   ├─ Decrypt: All user fields
   ├─ Check: User is active (isActive === true)
   ├─ Get: role
   └─ Return: 401 if not found/inactive
   
   Step 6 - Populate Context:
   ├─ req.user = { id, role, sessionId, email, ... }
   ├─ req.auth = { accessToken, sessionId }
   └─ Continue: ✓
   
   Step 7 - Optional RBAC Check:
   ├─ If route requires specific role:
   ├─ Check: req.user.role === required
   └─ Return: 403 Forbidden if mismatch

4. Backend: Controller processes request
   ├─ Access: req.user.id for data filtering
   ├─ Check: req.user.role for authorization
   └─ Execute: Business logic

5. Frontend: Receive response
   ├─ Success (200): Process data
   ├─ Unauthorized (401): Auto-refresh logic
   │  ├─ Send: refreshToken to /api/auth/refresh
   │  ├─ Get: New accessToken
   │  ├─ Retry: Original request
   │  └─ Handle: Success or permanent logout
   └─ Forbidden (403): Show error


┌─────────────────────────────────────────────────────────────────┐
│                      TOKEN REFRESH FLOW                          │
└─────────────────────────────────────────────────────────────────┘

Triggered when:
├─ 401 response on protected request
├─ Frontend calls refreshSession() periodically
└─ Frontend idle timeout approaching


1. Frontend: POST /api/auth/refresh
   ├─ Sends: Cookie with refresh token (httpOnly)
   └─ Body: Empty

2. Backend: authController.refreshLogin()
   ├─ Get: Refresh token from cookie
   ├─ Call: tokenService.rotateRefreshSession()
   │
   │  Implementation (Line 243-290, tokenService.js):
   │  ├─ Hash: Provided refresh token
   │  ├─ Load: All sessions from DB
   │  ├─ Find: Match by CBC-MAC hash (timing-safe)
   │  ├─ Validate: Status, expiry, idle timeout
   │  ├─ Load & Decrypt: User document
   │  ├─ Generate: New refresh token
   │  ├─ Create: New session document
   │  ├─ Revoke: Old session (status = 'REPLACED')
   │  ├─ Encrypt: New session
   │  └─ Save: Both sessions to MongoDB
   │
   ├─ Generate: New access token (15m)
   ├─ Set: New refresh token cookie (httpOnly)
   └─ Return: { accessToken, refreshToken, user }

3. Frontend: AuthContext
   ├─ Update: accessToken in memory
   ├─ Update: Refresh cookie (automatic)
   ├─ Reset: Idle timer
   └─ Retry: Failed request


┌─────────────────────────────────────────────────────────────────┐
│                         USER LOGOUT                              │
└─────────────────────────────────────────────────────────────────┘

1. Frontend: Click logout button
   └─ AuthContext.logout()

2. Call: authService.logoutUser()
   └─ POST /api/auth/logout

3. Backend: authController.logout()
   ├─ Get: Refresh token from cookie
   ├─ Hash: Refresh token
   ├─ Find: Matching session
   ├─ Revoke: Set status = 'REVOKED'
   │         Set revokedReason = 'USER_LOGOUT'
   │         Set revokedAt = now
   ├─ Encrypt: Updated session
   ├─ Save: To MongoDB
   ├─ Clear: Refresh token cookie
   └─ Return: { success: true }

4. Frontend: AuthContext.clearAuthState()
   ├─ Clear: currentUser
   ├─ Clear: accessToken (from memory)
   ├─ Clear: Idle timer
   ├─ Call: clearAccessTokenForApi()
   ├─ Remove: Authorization header
   └─ Redirect: LoginPage


┌─────────────────────────────────────────────────────────────────┐
│                    ACTIVITY TRACKING FLOW                        │
└─────────────────────────────────────────────────────────────────┘

Frontend (AuthContext.js, Lines 95-100):

1. User action detected:
   ├─ Mouse move
   ├─ Keyboard input
   ├─ Page scroll
   └─ Touch event

2. handleUserActivity() called:
   ├─ Check: Is authenticated?
   ├─ Reset: Idle timer (5 min)
   ├─ Sync: Activity with server

3. syncActivityWithServer():
   ├─ Throttled: Only every 2 minutes (Line 18)
   ├─ Call: recordSessionActivity()
   └─ POST /api/auth/record-activity

Backend: authController.recordActivity()

1. Extract: Access token from header
2. Verify: Token and session
3. Load: Encrypted session
4. Update: lastActivityAt = now
5. Update: idleExpiresAt = now + 5 min
6. Encrypt: Updated session
7. Save: To MongoDB
8. Return: { success: true }

Result: Idle timeout extends with user activity

```

### Data Integrity Flow (CBC-MAC)

```
┌─────────────────────────────────────────────────────────────────┐
│                    WRITE OPERATION (Create/Update)              │
└─────────────────────────────────────────────────────────────────┘

1. Controller: Creates/updates document
   └─ Example: Create new user

2. Service Layer: Prepares data
   ├─ Validate: Input data
   ├─ Transform: Format data
   └─ Pass: To storage engine

3. Storage Engine (storage-engine.js):
   ├─ Load: Field protection rules
   ├─ Identify: Which fields to encrypt
   └─ Call: Encryption for each field

4. Encryption Layer:
   ├─ Determine: RSA or ECC (via encryption-rules.js)
   ├─ Encrypt: Field value
   ├─ Create: MAC tag for field
   │
   │  MAC Creation (cbc-mac-engine.js):
   │  ├─ Derive: AES key from master secret
   │  ├─ Canonicalize: Field parts
   │  ├─ Pad: Message to AES block size
   │  ├─ Encrypt: AES-128-CBC with zero IV
   │  ├─ Extract: Last 16 bytes as tag
   │  └─ Return: Hex tag (32 chars)
   │
   └─ Return: Encrypted field + MAC tag

5. Store: In MongoDB
   └─ Document contains:
      {
        _id: ...,
        username: { ciphertext: "...", mac: "abc123..." },
        email: { ciphertext: "...", mac: "def456..." },
        passwordHash: { ciphertext: "...", mac: "ghi789..." },
        ...
      }


┌─────────────────────────────────────────────────────────────────┐
│                      READ OPERATION (Fetch)                      │
└─────────────────────────────────────────────────────────────────┘

1. Query: Fetch document from MongoDB
   └─ Example: Load user by ID

2. Storage Engine: Decrypts & verifies
   ├─ Load: Field protection rules
   ├─ For each encrypted field:
   │
   │  Verification (integrity-checker.js):
   │  ├─ Get: Stored MAC tag
   │  ├─ Recompute: MAC for current ciphertext
   │  │
   │  │  Recompute Process:
   │  │  ├─ Derive: AES key (same as write)
   │  │  ├─ Canonicalize: Same format as write
   │  │  ├─ CBC-MAC: Compute tag again
   │  │  └─ Result: New 32-char hex tag
   │  │
   │  ├─ Compare: New tag vs stored tag
   │  │  └─ Use: timingSafeEqualHex() (constant-time)
   │  ├─ If match: Data is intact ✓
   │  └─ If mismatch: Data tampered! ✗
   │              → Throw error
   │              → Reject operation
   │
   ├─ Decrypt: Field value
   └─ Return: Plaintext data

3. Application: Uses verified data
   └─ Confidence: Data has not been modified


┌─────────────────────────────────────────────────────────────────┐
│                    TAMPERING DETECTION EXAMPLE                   │
└─────────────────────────────────────────────────────────────────┘

Original stored in MongoDB:
{
  _id: "user123",
  username: {
    ciphertext: "E2F4A7B9C1D3E5F7...",
    mac: "3a9f4e1b2c8d5f7a9b6c3d1e8f4a2b5c"
  }
}

Attacker modifies ciphertext in database:
{
  _id: "user123",
  username: {
    ciphertext: "X2F4A7B9C1D3E5F7...",  // Changed first byte
    mac: "3a9f4e1b2c8d5f7a9b6c3d1e8f4a2b5c"  // MAC unchanged
  }
}

Application reads document:
1. Get: Stored MAC = "3a9f4e1b2c8d5f7a9b6c3d1e8f4a2b5c"
2. Recompute: CBC-MAC(masterKey, tampered_ciphertext)
3. Result: "4x1g5h2i9j7k3l8m5n9o1p6q2r7s4t8u"
4. Compare: "3a9f4e1b..." vs "4x1g5h2i..."
5. Mismatch! ✗
6. Throw: DataIntegrityError
7. Reject: Operation, return 500

Result: Tampering detected and prevented!
```

---

## Summary Table: Security Features

| Feature | Mechanism | Location | Purpose |
|---------|-----------|----------|---------|
| **MAC** | CBC-MAC with AES-128-CBC | `server/src/security/data-integrity/` | Detect data tampering |
| **Timing-Safe Compare** | `crypto.timingSafeEqual()` | `cbc-mac-engine.js` L153-163 | Prevent timing attacks |
| **RBAC** | Role-based middleware checks | `server/src/middleware/authMiddleware.js` L90-204 | Restrict access by role |
| **Session Encryption** | All fields encrypted except _id | `server/src/models/RefreshSession.js` | Protect session data |
| **Refresh Token Hashing** | CBC-MAC hash (never plaintext) | `tokenService.js` L135-139 | Secure token storage |
| **Idle Timeout** | 5 min auto-logout | `AuthContext.js` L19, `tokenService.js` L40 | Auto-logout inactive users |
| **JWT Access Token** | HS256, 15m expiry | `tokenService.js` L141-151 | Short-lived API auth |
| **httpOnly Cookies** | Browser can't access JS | `tokenService.js` L125-130 | Prevent XSS token theft |
| **Session Fingerprinting** | IP + User-Agent capture | `tokenService.js` L109, L114 | Detect hijacking |
| **Token Rotation** | Old revoked on refresh | `tokenService.js` L243-290 | Limit compromise window |
| **PBKDF2 Hashing** | 200k iterations SHA-256 | `security/password-security/` | Secure password storage |
| **2FA/OTP** | Email-based OTP | `twoFactorService.js` | Multi-factor authentication |

---

## Key Security Constants

**File**: `server/src/services/tokenService.js`

```javascript
DEFAULT_ACCESS_EXPIRES_IN = '15m'              // Line 33
DEFAULT_REFRESH_EXPIRES_IN_DAYS = 7            // Line 34
DEFAULT_IDLE_TIMEOUT_MINUTES = 5               // Line 35
```

**File**: `client/src/context/AuthContext.js`

```javascript
IDLE_TIMEOUT_MS = 5 * 60 * 1000                // Line 19
ACTIVITY_SYNC_THROTTLE_MS = 2 * 60 * 1000     // Line 20
```

**File**: `server/src/constants/roles.js`

```javascript
ROLES.USER = 'user'                            // Line 48
ROLES.ADMIN = 'admin'                          // Line 49
```

---

## Conclusion

The Secure Banking Platform implements three critical security layers:

1. **Data Integrity (MAC)**: CBC-MAC with constant-time comparison ensures no record is silently modified.

2. **Access Control (RBAC)**: Role-based middleware enforces granular permissions, preventing unauthorized access.

3. **Session Security**: Encrypted sessions with idle timeout, token rotation, and fingerprinting protect user sessions from hijacking and provide automatic cleanup.

All three features work together to create a defense-in-depth security architecture suitable for a banking platform.

---

*Document prepared for VIVA Examination*
*CSE447 - Secure Banking Platform Project*
