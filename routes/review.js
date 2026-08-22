const express = require("express");
const router = express.Router();
 
const { buildRepoIndex } = require("../src/repoIndexer");
const { buildIndex, retrieveRelevantChunks } = require("../src/retriever");
const { parseDiff, summarizeFileChanges } = require("../src/diffParser");
const { generateReviewForFile } = require("../src/reviewGenerator");
const { computeOverallRisk } = require("../src/riskScorer");
const { formatReviewAsMarkdown } = require("../src/reviewFormatter");
 
/**
 * POST /api/review
 * body: { repoPath: string, diffFile?: string, diffText?: string }
 *
 * Either diffFile (a path readable from the server) or diffText (the raw
 * unified diff, e.g. from a CI job) can be supplied.
 */
router.post("/review", async (req, res) => {
  const { repoPath, diffFile, diffText: diffTextBody } = req.body || {};
 
  if (!repoPath) {
    return res.status(400).json({ error: "repoPath is required" });
  }
  if (!diffFile && !diffTextBody) {
    return res.status(400).json({ error: "either diffFile or diffText is required" });
  }
 
  try {
    const fs = require("fs");
    const path = require("path");
 
    const resolvedRepoPath = path.resolve(repoPath);
    const diffText = diffTextBody || fs.readFileSync(path.resolve(diffFile), "utf8");
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
    const model = process.env.OLLAMA_MODEL || "qwen2.5-coder:7b";
    const temperature =
      process.env.OLLAMA_TEMPERATURE !== undefined
        ? parseFloat(process.env.OLLAMA_TEMPERATURE)
        : undefined;
    const topK = parseInt(process.env.RAG_TOP_K || "5", 10);
 
    const repoIndex = buildRepoIndex(resolvedRepoPath);
    const tfidfIndex = buildIndex(repoIndex.chunks);
 
    const parsedFiles = parseDiff(diffText);
 
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
        { ollamaUrl, model, temperature }
      );
      fileReviews.push(review);
    }
 
    const overallRisk = computeOverallRisk(fileReviews);
    const markdown = formatReviewAsMarkdown({ overallRisk, fileReviews });
 
    res.json({
      repoStats: { fileCount: repoIndex.fileCount, chunkCount: repoIndex.chunkCount },
      overallRisk,
      fileReviews,
      markdown,
    });
  } catch (err) {
    console.error("Review generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});
 
module.exports = router;
 