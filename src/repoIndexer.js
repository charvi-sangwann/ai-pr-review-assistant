const fs = require("fs");
const path = require("path");

// Directories we never want to index
const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "coverage",
  "venv", "__pycache__", ".cache", ".vscode", ".idea",
]);

// Extensions we treat as "source" (extend as needed)
const SOURCE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".go", ".rb",
  ".php", ".c", ".cpp", ".h", ".hpp", ".cs", ".rs", ".swift",
  ".kt", ".json", ".yml", ".yaml", ".md",
]);

const MAX_FILE_SIZE_BYTES = 500 * 1024; // skip anything absurdly large

/**
 * Recursively walk a directory and return a list of absolute file paths
 * for files worth indexing.
 */
function walkRepo(rootDir) {
  const results = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return; // unreadable dir, skip
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        // skip hidden files/dirs except a few harmless ones, keeps noise down
        if (entry.isDirectory() && !IGNORED_DIRS.has(entry.name)) continue;
        if (!entry.isDirectory()) continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (!SOURCE_EXTENSIONS.has(ext)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > MAX_FILE_SIZE_BYTES) continue;
        } catch {
          continue;
        }
        results.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return results;
}

/**
 * Split a file's content into overlapping line-based chunks.
 * Simple and language-agnostic - good enough for an MVP retriever.
 * (A v2 upgrade path is AST-aware chunking, e.g. per function/class.)
 */
function chunkFile(filePath, rootDir, { chunkSizeLines = 60, overlapLines = 10 } = {}) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const relPath = path.relative(rootDir, filePath);
  const chunks = [];

  if (lines.length === 0) return chunks;

  let start = 0;
  let chunkIndex = 0;
  while (start < lines.length) {
    const end = Math.min(start + chunkSizeLines, lines.length);
    const text = lines.slice(start, end).join("\n");
    if (text.trim().length > 0) {
      chunks.push({
        id: `${relPath}::chunk${chunkIndex}`,
        file: relPath,
        startLine: start + 1,
        endLine: end,
        text,
      });
      chunkIndex++;
    }
    if (end === lines.length) break;
    start = end - overlapLines; // overlap for context continuity
    if (start < 0) start = 0;
  }

  return chunks;
}

/**
 * Build the full chunk index for a repository.
 */
function buildRepoIndex(rootDir, options = {}) {
  const files = walkRepo(rootDir);
  const allChunks = [];
  for (const file of files) {
    const chunks = chunkFile(file, rootDir, options);
    allChunks.push(...chunks);
  }
  return {
    rootDir,
    fileCount: files.length,
    chunkCount: allChunks.length,
    chunks: allChunks,
  };
}

module.exports = { walkRepo, chunkFile, buildRepoIndex };
