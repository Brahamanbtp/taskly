const { pool } = require('../db');
const { generateEmbedding, isAvailable: isAIAvailable } = require('../lib/embeddings');

// Full-text search using tsvector (typo-tolerant via prefix matching)
async function searchTasks(req, res) {
  const workspaceId = req.workspace.id;
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    // Convert user query to tsquery with prefix matching for typo tolerance
    // Split words and add :* for prefix matching
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const tsQuery = terms.map(t => `${t}:*`).join(' & ');

    const r = await client.query(`
      SELECT 
        id, title, description, tags, status, priority, due_date, position, created_at, updated_at,
        ts_rank(search_vector, to_tsquery('english', $1)) AS rank
      FROM tasks 
      WHERE workspace_id = $2 
        AND search_vector @@ to_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT 50
    `, [tsQuery, workspaceId]);

    await client.query('COMMIT');
    return res.json({ results: r.rows, type: 'fulltext', query });
  } catch (err) {
    await client.query('ROLLBACK');
    // Fallback to ILIKE if tsquery fails (e.g. special characters)
    try {
      const fallback = await client.query(`
        SELECT id, title, description, tags, status, priority, due_date, position, created_at, updated_at
        FROM tasks WHERE workspace_id = $1 AND (title ILIKE $2 OR description ILIKE $2)
        ORDER BY created_at DESC LIMIT 50
      `, [workspaceId, `%${query}%`]);
      return res.json({ results: fallback.rows, type: 'fallback', query });
    } catch (fallbackErr) {
      throw fallbackErr;
    }
  } finally {
    client.release();
  }
}

// Semantic AI search using pgvector cosine similarity
async function semanticSearch(req, res) {
  const workspaceId = req.workspace.id;
  const query = req.query.q;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (!isAIAvailable()) {
    return res.status(503).json({ error: 'AI search unavailable. Set OPENAI_API_KEY in .env' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to generate search embedding' });
    }

    // Convert to Postgres vector format
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const r = await client.query(`
      SELECT 
        id, title, description, tags, status, priority, due_date, position, created_at, updated_at,
        1 - (embedding <=> $1::vector) AS similarity
      FROM tasks 
      WHERE workspace_id = $2 
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT 20
    `, [vectorStr, workspaceId]);

    await client.query('COMMIT');
    return res.json({ results: r.rows, type: 'semantic', query });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Check if AI features are available
async function getSearchCapabilities(req, res) {
  const client = await pool.connect();
  let pgvectorEnabled = false;
  try {
    const ext = await client.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
    pgvectorEnabled = ext.rowCount > 0;
  } catch { /* not available */ }
  finally { client.release(); }

  return res.json({
    fulltext: true,
    semantic: pgvectorEnabled && isAIAvailable(),
    pgvector: pgvectorEnabled,
    openai: isAIAvailable(),
  });
}

module.exports = { searchTasks, semanticSearch, getSearchCapabilities };
