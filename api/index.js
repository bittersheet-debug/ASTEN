/**
 * ASTEN! (ASISTEN TENAGA!) - Vercel Serverless Entry Point
 */

const app = require('../src/api/server');

// Export Express app as standard Vercel serverless function
module.exports = app;
