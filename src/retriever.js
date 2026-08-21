/**
 * MVP retrieval layer.
 *
 * Real embedding APIs (Voyage AI, OpenAI, etc.) cost money and require network
 * calls per chunk. For a first working version we build TF-IDF vectors
 * locally and rank chunks by cosine similarity against the diff content.
 * This is a genuine, defensible RAG implementation - it's just using a
 * classic sparse-vector representation instead of a dense neural embedding.
 *
 * Swap-in upgrade path (v2): replace `vectorize()` with calls to an
 * embedding API and store vectors in a real vector DB (e.g. pgvector,
 * Pinecone, Chroma). The rest of the retrieval interface stays the same.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "is", "are", "of", "to", "in", "on",
  "for", "this", "that", "it", "with", "as", "be", "by", "at", "from",
]);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9_$]+/g) || []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t)
  );
}

function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Build a TF-IDF index over a set of chunks.
 * Returns { chunks, idf, vectors } where vectors[i] corresponds to chunks[i].
 */
function buildIndex(chunks) {
  const docTokens = chunks.map((c) => tokenize(c.text));
  const df = new Map(); // document frequency per term

  docTokens.forEach((tokens) => {
    const seen = new Set(tokens);
    for (const term of seen) df.set(term, (df.get(term) || 0) + 1);
  });

  const N = chunks.length || 1;
  const idf = new Map();
  for (const [term, count] of df.entries()) {
    idf.set(term, Math.log(N / count) + 1); // smoothed idf
  }

  const vectors = docTokens.map((tokens) => {
    const tf = termFrequency(tokens);
    const vec = new Map();
    for (const [term, freq] of tf.entries()) {
      const weight = freq * (idf.get(term) || 0);
      if (weight > 0) vec.set(term, weight);
    }
    return vec;
  });

  return { idf, vectors };
}

function vectorizeQuery(text, idf) {
  const tokens = tokenize(text);
  const tf = termFrequency(tokens);
  const vec = new Map();
  for (const [term, freq] of tf.entries()) {
    const weight = freq * (idf.get(term) || 0.0001); // small default for unseen terms
    if (weight > 0) vec.set(term, weight);
  }
  return vec;
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weight] of vecA.entries()) {
    normA += weight * weight;
    if (vecB.has(term)) dot += weight * vecB.get(term);
  }
  for (const weight of vecB.values()) normB += weight * weight;

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieve the top-K most relevant chunks for a query string,
 * optionally excluding chunks belonging to a given file (so a changed
 * file's own diff doesn't just retrieve itself).
 */
function retrieveRelevantChunks(query, chunks, index, { topK = 5, excludeFile = null } = {}) {
  const queryVec = vectorizeQuery(query, index.idf);

  const scored = chunks
    .map((chunk, i) => ({
      chunk,
      score: cosineSimilarity(queryVec, index.vectors[i]),
    }))
    .filter((s) => (excludeFile ? s.chunk.file !== excludeFile : true))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}

module.exports = { buildIndex, retrieveRelevantChunks, tokenize };
