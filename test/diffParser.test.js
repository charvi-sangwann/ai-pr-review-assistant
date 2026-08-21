const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseDiff, summarizeFileChanges } = require("../src/diffParser");

test("parseDiff parses the sample diff into one file with added lines", () => {
  const diffText = fs.readFileSync(path.join(__dirname, "..", "test-data", "sample.diff"), "utf8");
  const files = parseDiff(diffText);

  assert.equal(files.length, 1);
  assert.equal(files[0].file, "routes/users.js");
  assert.equal(files[0].hunks.length, 1);

  const { addedText, removedText } = summarizeFileChanges(files[0]);
  assert.match(addedText, /router\.get\("\/users\/search"/);
  assert.match(addedText, /SELECT \* FROM users WHERE name/);
  assert.equal(removedText, "");
});

test("parseDiff ignores preamble before the first diff header", () => {
  const diffText = "some noise\nmore noise\n" + fs.readFileSync(
    path.join(__dirname, "..", "test-data", "sample.diff"),
    "utf8"
  );
  const files = parseDiff(diffText);
  assert.equal(files.length, 1);
});

test("parseDiff returns empty array for empty input", () => {
  assert.deepEqual(parseDiff(""), []);
});
