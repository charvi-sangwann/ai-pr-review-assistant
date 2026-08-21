#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const { buildRepoIndex } = require("./src/repoIndexer");
const { buildIndex, retrieveRelevantChunks } = require("./src/retriever");
const { parseDiff, summarizeFileChanges } = require("./src/diffParser");
const { generateReviewForFile } = require("./src/reviewGenerator");
const { computeOverallRisk } = require("./src/riskScorer");
const { formatReviewAsMarkdown } = require("./src/reviewFormatter");

async function main() {
  const [, , repoPathArg, diffFileArg] = process.argv;

  if (!repoPathArg || !diffFileArg) {
    console.error("Usage: node cli.js <repoPath> <diffFile>");
    console.error("Example: node cli.js ./test-data/sample-repo ./test-data/sample.diff");
    process.exit(1);
  }

  const resolvedRepoPath = path.resolve(repoPathArg);
  const diffText = fs.readFileSync(path.resolve(diffFileArg), "utf8");
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
  const model = process.env.OLLAMA_MODEL || "deepseek-coder:1.3b";
  const topK = parseInt(process.env.RAG_TOP_K || "5", 10);

  console.log(`Indexing repo: ${resolvedRepoPath} ...`);
  const repoIndex = buildRepoIndex(resolvedRepoPath);
  const tfidfIndex = buildIndex(repoIndex.chunks);
  console.log(`Indexed ${repoIndex.fileCount} files / ${repoIndex.chunkCount} chunks.`);

  const parsedFiles = parseDiff(diffText);
  console.log(`Diff touches ${parsedFiles.length} file(s). Generating review with ${model} via ${ollamaUrl} ...\n`);

  const fileReviews = [];
  for (const parsedFile of parsedFiles) {
    const { addedText, removedText } = summarizeFileChanges(parsedFile);
    const query = `${addedText}\n${removedText}`.trim() || parsedFile.file;

    const contextChunks = retrieveRelevantChunks(query, repoIndex.chunks, tfidfIndex, {
      topK,
      excludeFile: parsedFile.file,
    });

    const review = await generateReviewForFile(
      { file: parsedFile.file, addedText, removedText, contextChunks },
      { ollamaUrl, model }
    );
    fileReviews.push(review);
  }

  const overallRisk = computeOverallRisk(fileReviews);
  const markdown = formatReviewAsMarkdown({ overallRisk, fileReviews });

  console.log(markdown);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
