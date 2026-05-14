require('dotenv').config();
const { pool } = require('./src/db');

(async () => {
  try {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log("SUCCESS! Tables found:", res.rows.map(r => r.table_name));
    
    // Check if tasks table has priority column
    const tasksCols = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'tasks';
    `);
    const cols = tasksCols.rows.map(r => r.column_name);
    console.log("Tasks table columns:", cols);
    
    if (!cols.includes('priority')) {
      console.log("WARNING: 'priority' column is missing from tasks table!");
    }
    
    process.exit(0);
  } catch (err) {
    console.error("CONNECTION ERROR:", err.message);
    process.exit(1);
  }
})();
