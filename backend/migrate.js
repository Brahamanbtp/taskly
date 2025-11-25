// backend/migrate.js
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set in .env');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL });

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', 'init.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('Running migration...');
    await client.query(sql);
    console.log('Migration finished.');
  } catch (err) {
    console.error('Migration error', err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
