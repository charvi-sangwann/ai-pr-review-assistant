/**
 * Minimal unified-diff parser. Handles standard `git diff` / PR patch output:
 *
 * diff --git a/foo.js b/foo.js
 * index abc123..def456 100644
 * --- a/foo.js
 * +++ b/foo.js
 * @@ -12,6 +12,8 @@ function bar() {
 * -  old line
 * +  new line
 *
 * Returns an array of { file, hunks: [{ header, newStart, addedLines, removedLines, contextLines }] }
 */

function parseDiff(diffText) {
  const lines = diffText.split("\n");
  const files = [];
  let currentFile = null;
  let currentHunk = null;

  const fileHeaderRe = /^diff --git a\/(.+) b\/(.+)$/;
  const hunkHeaderRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

  for (const line of lines) {
    const fileMatch = line.match(fileHeaderRe);
    if (fileMatch) {
      currentFile = { file: fileMatch[2], hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue; // ignore preamble/noise before first diff header

    if (line.startsWith("--- ") || line.startsWith("+++ ")) continue;

    const hunkMatch = line.match(hunkHeaderRe);
    if (hunkMatch) {
      currentHunk = {
        header: line,
        newStart: parseInt(hunkMatch[2], 10),
        context: hunkMatch[3].trim(),
        addedLines: [],
        removedLines: [],
        contextLines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      currentHunk.addedLines.push(line.slice(1));
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      currentHunk.removedLines.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      currentHunk.contextLines.push(line.slice(1));
    }
  }

  return files;
}

/**
 * Produce a compact text summary of a parsed file's changes, suitable
 * for use as a retrieval query and as part of the LLM prompt.
 */
function summarizeFileChanges(parsedFile) {
  const addedText = parsedFile.hunks.flatMap((h) => h.addedLines).join("\n");
  const removedText = parsedFile.hunks.flatMap((h) => h.removedLines).join("\n");
  return { addedText, removedText };
}

module.exports = { parseDiff, summarizeFileChanges };
