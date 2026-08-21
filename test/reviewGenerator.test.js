const test = require("node:test");
const assert = require("node:assert/strict");
const { generateReviewForFile, extractJsonObject } = require("../src/reviewGenerator");

function withMockedFetch(mockImpl, fn) {
  const original = global.fetch;
  global.fetch = mockImpl;
  return fn().finally(() => {
    global.fetch = original;
  });
}

test("extractJsonObject strips markdown fences and parses JSON", () => {
  const raw = '```json\n{"summary":"ok","riskScore":3,"issues":[]}\n```';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.summary, "ok");
  assert.equal(parsed.riskScore, 3);
});

test("extractJsonObject throws when no JSON object is present", () => {
  assert.throws(() => extractJsonObject("no json here"));
});

test("generateReviewForFile returns a well-formed review on a clean model response", async () => {
  await withMockedFetch(
    async () => ({
      ok: true,
      json: async () => ({
        response: JSON.stringify({
          summary: "Adds a SQL-injectable endpoint",
          riskScore: 9,
          issues: [
            {
              severity: "high",
              category: "security",
              comment: "Raw string concatenation into SQL",
              suggestion: "Use parameterized queries",
            },
          ],
        }),
      }),
    }),
    async () => {
      const review = await generateReviewForFile(
        { file: "routes/users.js", addedText: "...", removedText: "", contextChunks: [] },
        { ollamaUrl: "http://localhost:11434/api/generate", model: "deepseek-coder:1.3b" }
      );
      assert.equal(review.file, "routes/users.js");
      assert.equal(review.riskScore, 9);
      assert.equal(review.issues.length, 1);
      assert.equal(review.issues[0].severity, "high");
    }
  );
});

test("generateReviewForFile degrades gracefully when the model is unreachable", async () => {
  await withMockedFetch(
    async () => {
      throw new Error("ECONNREFUSED");
    },
    async () => {
      const review = await generateReviewForFile(
        { file: "routes/users.js", addedText: "...", removedText: "", contextChunks: [] },
        { ollamaUrl: "http://localhost:11434/api/generate", model: "deepseek-coder:1.3b" }
      );
      assert.equal(review.file, "routes/users.js");
      assert.match(review.summary, /could not reach local model/);
      assert.deepEqual(review.issues, []);
    }
  );
});

test("generateReviewForFile degrades gracefully on malformed JSON from the model", async () => {
  await withMockedFetch(
    async () => ({
      ok: true,
      json: async () => ({ response: "not valid json at all" }),
    }),
    async () => {
      const review = await generateReviewForFile(
        { file: "routes/users.js", addedText: "...", removedText: "", contextChunks: [] },
        {}
      );
      assert.equal(review.summary, "Unable to parse AI review");
      assert.equal(review.riskScore, 5);
    }
  );
});
