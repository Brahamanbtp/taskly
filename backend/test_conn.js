const { Pool } = require('pg');

const urls = [
  "postgresql://postgres.wktcsdlqjwxennlicjaj:Brahamanbtp123@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres",
  "postgresql://postgres.wktcsdlqjwxennlicjaj:Brahamanbtp123@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
  "postgresql://postgres:Brahamanbtp123@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres",
  "postgresql://postgres:Brahamanbtp123@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
];

async function testConnection(url, index) {
  console.log(`Testing URL ${index + 1}...`);
  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    const res = await pool.query('SELECT 1 as result');
    console.log(`SUCCESS on URL ${index + 1}`);
    return true;
  } catch (err) {
    console.log(`FAILED on URL ${index + 1}: ${err.message}`);
    return false;
  } finally {
    await pool.end();
  }
}

(async () => {
  for (let i = 0; i < urls.length; i++) {
    const success = await testConnection(urls[i], i);
    if (success) {
      console.log(`\n\nWORKING URL: ${urls[i]}`);
      process.exit(0);
    }
  }
  console.log("\n\nAll attempts failed.");
  process.exit(1);
})();
