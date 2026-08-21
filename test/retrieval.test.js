const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { buildRepoIndex } = require("../src/repoIndexer");
const { buildIndex, retrieveRelevantChunks } = require("../src/retriever");

const SAMPLE_REPO = path.join(__dirname, "..", "test-data", "sample-repo");

test("buildRepoIndex walks the sample repo and finds all 3 source files", () => {
  const repoIndex = buildRepoIndex(SAMPLE_REPO);
  assert.equal(repoIndex.fileCount, 3);
  assert.ok(repoIndex.chunkCount >= 3);
});

test("retrieval surfaces db.js and auth.js as related context for the users.js diff", () => {
  const repoIndex = buildRepoIndex(SAMPLE_REPO);
  const tfidfIndex = buildIndex(repoIndex.chunks);

  // Mirrors the query cli.js builds: added/removed lines from the diff
  const query = `
    router.get("/users/search", async (req, res) => {
      const name = req.query.name;
      const sql = "SELECT * FROM users WHERE name = '" + name + "'";
      const result = await query(sql);
      res.json(result.rows);
    });
  `;

  const results = retrieveRelevantChunks(query, repoIndex.chunks, tfidfIndex, {
    topK: 5,
    excludeFile: "routes/users.js",
  });

  const filesRetrieved = results.map((r) => r.chunk.file);
  assert.ok(filesRetrieved.includes("db.js"), `expected db.js in ${filesRetrieved}`);
  assert.ok(
    filesRetrieved.some((f) => f.includes("auth.js")),
    `expected utils/auth.js in ${filesRetrieved}`
  );
});

test("retrieveRelevantChunks excludes the file being reviewed", () => {
  const repoIndex = buildRepoIndex(SAMPLE_REPO);
  const tfidfIndex = buildIndex(repoIndex.chunks);
  const results = retrieveRelevantChunks("SELECT * FROM users", repoIndex.chunks, tfidfIndex, {
    excludeFile: "db.js",
  });
  assert.ok(!results.some((r) => r.chunk.file === "db.js"));
});
