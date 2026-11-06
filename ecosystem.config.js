/**
 * PM2 Ecosystem Config – Assetro Platform (Unified API)
 *
 * Before: 8 backend processes (7 microservices + gateway)
 * After:  1 backend process (unified API)
 */

module.exports = {
  apps: [
    // ================= BACKEND (Single Unified API) =================
    {
      name: 'assetro-api',
      cwd: './apps/api',
      script: 'node',
      args: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        BLOCKCHAIN_MODE: 'live',
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
    },

    // ================= FRONTEND =================
    // Investor + Issuer, one app: investor at /, issuer under /issuer.
    {
      name: 'web-platform',
      cwd: './apps/web-platform',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
      },
      error_file: './logs/web-platform-error.log',
      out_file: './logs/web-platform-out.log',
    },
    {
      name: 'web-admin',
      cwd: './apps/web-admin',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
      },
      error_file: './logs/web-admin-error.log',
      out_file: './logs/web-admin-out.log',
    },
  ],
};
