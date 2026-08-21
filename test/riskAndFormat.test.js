const test = require("node:test");
const assert = require("node:assert/strict");
const { computeOverallRisk } = require("../src/riskScorer");
const { formatReviewAsMarkdown } = require("../src/reviewFormatter");

test("computeOverallRisk returns low/1 for no file reviews", () => {
  const result = computeOverallRisk([]);
  assert.deepEqual(result, { score: 1, label: "low", totalIssues: 0 });
});

test("computeOverallRisk escalates to high/critical with severe issues", () => {
  const result = computeOverallRisk([
    {
      riskScore: 9,
      issues: [
        { severity: "high", category: "security" },
        { severity: "high", category: "security" },
      ],
    },
  ]);
  assert.equal(result.totalIssues, 2);
  assert.ok(result.score >= 6, `expected score >= 6, got ${result.score}`);
});

test("formatReviewAsMarkdown renders a header and per-file sections", () => {
  const md = formatReviewAsMarkdown({
    overallRisk: { score: 7, label: "high", totalIssues: 1 },
    fileReviews: [
      {
        file: "routes/users.js",
        summary: "Adds a SQL-injectable search endpoint",
        riskScore: 8,
        issues: [
          {
            severity: "high",
            category: "security",
            comment: "String concatenation used to build SQL query",
            suggestion: "Use parameterized query via db.js's query() helper",
          },
        ],
      },
    ],
  });

  assert.match(md, /## 🤖 AI Code Review/);
  assert.match(md, /HIGH \(7\/10\)/);
  assert.match(md, /routes\/users\.js/);
  assert.match(md, /SQL-injectable/);
});
