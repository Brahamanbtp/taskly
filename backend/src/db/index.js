const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set in env');
  process.exit(1);
}

const pool = new Pool({ 
  connectionString: DATABASE_URL, 
  max: 10,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

module.exports = { pool };
