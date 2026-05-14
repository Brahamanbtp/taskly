const OpenAI = require('openai');

let openai = null;

function getClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

async function generateEmbedding(text) {
  const client = getClient();
  if (!client) return null;
  
  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // Token limit safety
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('Embedding generation failed:', err.message);
    return null;
  }
}

function isAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

module.exports = { generateEmbedding, isAvailable };
