require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting Database Schema Initialization...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('✅ Database Schema Initialized Successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
