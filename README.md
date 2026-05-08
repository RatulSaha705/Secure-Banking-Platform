# Secure Banking Platform

A full-stack secure banking web application built with React, Express.js, and MongoDB. The platform supports customer banking operations, administrator controls, two-factor authentication, encrypted storage, transaction tracking, notifications, support tickets, and custom key-management logic.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Security Highlights](#security-highlights)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Project](#running-the-project)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [User Roles](#user-roles)
- [Development Notes](#development-notes)
- [Important Security Notes](#important-security-notes)

## Overview

Secure Banking Platform is a MERN-style banking system with a React frontend and an Express/MongoDB backend. It is designed around secure user authentication, encrypted database fields, role-based access control, account management, money transfers, transaction history, admin operations, notifications, and user support workflows.

The backend contains custom security modules for:

- RSA and ECC key generation and encryption
- encrypted field storage
- message/data integrity checking
- password hashing
- two-factor authentication
- refresh-token sessions
- rate limiting
- key rotation

## Features

### Customer Features

- User registration with OTP verification
- Login with OTP-based two-factor verification
- JWT access-token authentication
- Refresh-token based session renewal
- Dashboard with account summary
- Account balance view
- Money transfer flow
- Transaction history and transaction details
- Beneficiary management
- Profile view and update
- Notification center
- Support ticket creation, updates, and comments
- Protected routes for authenticated users

### Admin Features

- Admin dashboard summary
- View and manage users
- Ban and unban users
- Change user roles
- View user details
- View and filter transactions
- Manage support tickets
- Send notifications to users by user ID or account number
- Admin-only protected routes

### Backend Features

- REST API built with Express.js
- MongoDB persistence using Mongoose
- Centralized error handling
- Request logging with Winston and Morgan
- Helmet security headers
- CORS configuration
- Cookie parsing for refresh-token sessions
- Separate rate limiters for normal API usage, authentication, OTP verification, session refresh, and activity tracking

## Tech Stack

### Frontend

- React 18
- React Router DOM
- Axios
- React Hot Toast
- Tailwind CSS
- Create React App

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Tokens
- Express Validator
- Express Rate Limit
- Helmet
- Cookie Parser
- Morgan
- Winston
- Nodemailer

### Security Modules

- PBKDF2-SHA256 password hashing
- RSA encryption
- ECC encryption
- encrypted field storage
- HMAC/integrity checking
- per-user key management
- key rotation support
- two-factor OTP challenges

## Project Structure

```text
Secure Banking Platform/
├── client/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── guards/
│   │   │   └── layout/
│   │   ├── context/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── App.js
│   │   ├── index.css
│   │   └── index.js
│   ├── package.json
│   ├── postcss.config.js
│   └── tailwind.config.js
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── constants/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── security/
│   │   │   ├── crypto-math/
│   │   │   ├── data-integrity/
│   │   │   ├── ecc/
│   │   │   ├── field-encryption/
│   │   │   ├── hashing/
│   │   │   ├── key-management/
│   │   │   ├── password-security/
│   │   │   ├── rsa/
│   │   │   └── secure-storage/
│   │   ├── services/
│   │   ├── utils/
│   │   ├── validators/
│   │   └── app.js
│   └── package.json
│
└── .gitignore
```

## Security Highlights

This project includes several security-focused design decisions:

- Passwords are hashed using PBKDF2-SHA256 with random salts.
- Authentication uses short-lived access tokens and refresh sessions.
- Login and registration use OTP verification.
- Sensitive MongoDB fields are stored in encrypted form.
- User data uses per-user RSA/ECC key records.
- Transaction, notification, ticket, profile, account, and beneficiary data pass through encrypted storage services.
- Role-based middleware protects user-only and admin-only routes.
- Rate limiters are separated by route type to reduce brute-force risk while avoiding unnecessary blocking during normal navigation.
- Helmet is enabled for common HTTP security headers.
- CORS is restricted through environment configuration.

## Prerequisites

Install the following before running the project:

- Node.js 18 or newer
- npm
- MongoDB Atlas account or local MongoDB instance
- SMTP credentials for email OTP delivery, or console fallback for local testing

## Installation

Clone the repository:

```bash
git clone <repository-url>
cd "Secure Banking Platform"
```

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies:

```bash
cd ../client
npm install
```

## Environment Variables

Create environment files for both the server and client.

### `server/.env`

```env
NODE_ENV=development
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_ACCESS_SECRET=your_access_token_secret
JWT_ACCESS_EXPIRES_IN=15m

JWT_REFRESH_SECRET=your_refresh_token_secret
JWT_REFRESH_EXPIRES_IN_DAYS=7
REFRESH_COOKIE_NAME=refreshToken
SESSION_IDLE_TIMEOUT_MINUTES=30

CLIENT_ORIGIN=http://localhost:3000

LOOKUP_HASH_SECRET=your_lookup_hash_secret
SECURITY_MAC_MASTER_KEY=your_mac_master_key
HMAC_MASTER_KEY=your_mac_master_key

SECURITY_RSA_PRIVATE_KEYS_B64=your_base64_rsa_private_key_map
SECURITY_ECC_PRIVATE_KEYS_B64=your_base64_ecc_private_key_map

KEY_AUTO_ROTATION_ENABLED=false
KEY_ROTATION_DAYS=30
KEY_ROTATION_CHECK_INTERVAL_MS=21600000

SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
BANK_EMAIL_FROM_NAME=SecureBank
BANK_EMAIL_FROM_ADDRESS=no-reply@example.com

TWO_FACTOR_OTP_SECRET=your_otp_secret
TWO_FACTOR_OTP_TTL_MINUTES=5
TWO_FACTOR_MAX_ATTEMPTS=5

EMAIL_ALLOW_CONSOLE_FALLBACK=true
AUTH_DEV_RETURN_OTP=true
DISABLE_OTP_EMAIL=false
```

### `client/.env`

```env
REACT_APP_API_URL=http://localhost:5000/api
```

## Running the Project

Start the backend server:

```bash
cd server
npm run dev
```

The backend runs on:

```text
http://localhost:5000
```

Start the React client in another terminal:

```bash
cd client
npm start
```

The frontend runs on:

```text
http://localhost:3000
```

Health check endpoint:

```text
GET http://localhost:5000/health
```

## Available Scripts

### Backend

```bash
npm start
```

Runs the Express server using Node.

```bash
npm run dev
```

Runs the Express server with Nodemon for development.

### Frontend

```bash
npm start
```

Runs the React development server.

```bash
npm run build
```

Builds the React app for production.

```bash
npm test
```

Runs frontend tests through Create React App.

## API Overview

Base URL:

```text
/api
```

### Authentication

```text
POST /api/auth/register
POST /api/auth/register/verify
POST /api/auth/login
POST /api/auth/login/verify
POST /api/auth/refresh
POST /api/auth/activity
POST /api/auth/logout
GET  /api/auth/me
```

### Dashboard

```text
GET /api/dashboard/summary
GET /api/dashboard/admin/summary
```

### Account

```text
GET /api/account/balance
GET /api/account/me
GET /api/account/admin/:userId
```

### Transfer

```text
POST /api/transfer/initiate
GET  /api/transfer/history
GET  /api/transfer/history/:txnId
```

### Beneficiaries

```text
GET    /api/beneficiary
POST   /api/beneficiary
PATCH  /api/beneficiary/:id
DELETE /api/beneficiary/:id
```

### Profile

```text
GET /api/profile/me
PUT /api/profile/me
GET /api/profile/admin/:userId
```

### Notifications

```text
GET   /api/notifications
GET   /api/notifications/unread-count
PATCH /api/notifications/read-all
PATCH /api/notifications/:id/read
POST  /api/notifications/admin/user/:userId
POST  /api/notifications/admin/account-number
```

### Support Tickets

```text
POST  /api/support-tickets
GET   /api/support-tickets
GET   /api/support-tickets/:id
PATCH /api/support-tickets/:id
POST  /api/support-tickets/:id/comments

GET   /api/support-tickets/admin/all
GET   /api/support-tickets/admin/:id
PATCH /api/support-tickets/admin/:id
```

### Admin Panel

```text
GET   /api/admin/overview
GET   /api/admin/summary
GET   /api/admin/users
GET   /api/admin/users/:userId
PATCH /api/admin/users/:userId/status
PATCH /api/admin/users/:userId/ban
PATCH /api/admin/users/:userId/unban
PATCH /api/admin/users/:userId/role
GET   /api/admin/transactions
GET   /api/admin/transactions/:transactionId
GET   /api/admin/support-tickets
GET   /api/admin/support-tickets/:ticketId
PATCH /api/admin/support-tickets/:ticketId
POST  /api/admin/transfer
```

### Key Management

```text
GET   /api/keys
POST  /api/keys
POST  /api/keys/ensure-initial
POST  /api/keys/ensure-user
POST  /api/keys/rotate
PATCH /api/keys/:keyId/retire
PATCH /api/keys/:keyId/compromised
```

## User Roles

The application uses two primary roles:

| Role | Description |
|---|---|
| `user` | Regular banking customer |
| `admin` | Administrator with access to user, transaction, notification, and support-ticket management |

## Development Notes

- The client uses Axios interceptors to attach access tokens and refresh sessions automatically when protected API requests return `401`.
- The server expects authenticated requests to include a Bearer access token.
- Refresh sessions are handled separately from access tokens.
- Admin pages check the current user's role before rendering protected admin tools.
- MongoDB documents use encrypted field structures, so raw database records are not meant to be read directly as plaintext.
- Several scripts are available under `server/src/scripts/` for testing security modules, clearing the database, promoting users, and migration tasks.

## Important Security Notes

Do not commit real secrets to GitHub.

Before publishing this project:

1. Remove `node_modules/` from the repository if it was committed or zipped.
2. Remove `server/logs/` and all `.log` files.
3. Remove real `.env` files.
4. Add safe `.env.example` files instead.
5. Rotate any MongoDB, JWT, SMTP, MAC, RSA, or ECC secrets that were exposed during development.
6. Disable development-only OTP settings in production:

```env
AUTH_DEV_RETURN_OTP=false
EMAIL_ALLOW_CONSOLE_FALLBACK=false
DISABLE_OTP_EMAIL=false
```

## Suggested GitHub Cleanup

Before pushing:

```bash
rm -rf client/node_modules server/node_modules
rm -rf server/logs
rm -f client/.env server/.env
```

Then commit only source code, configuration templates, and documentation.

## License

Add your preferred license here. For academic or private coursework projects, you may choose to keep the repository private unless instructed otherwise.
