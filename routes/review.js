const express = require("express");
const router = express.Router();

const { buildRepoIndex } = require("../src/repoIndexer");
const { buildIndex, retrieveRelevantChunks } = require("../src/retriever");
const { parseDiff, summarizeFileChanges } = require("../src/diffParser");
const { generateReviewForFile } = require("../src/reviewGenerator");
const { analyzeRepository } = require("../src/staticAnalyzer");
const { analyzeWithSemgrep } = require("../src/semgrepAnalyzer");
const { computeOverallRisk } = require("../src/riskScorer");
const { formatReviewAsMarkdown } = require("../src/reviewFormatter");
const { getGitDiff } = require("../src/gitDiff");

/**
 * POST /api/review
 *
 * body:
 * {
 *   repoPath: string,
 *   diffFile?: string,
 *   diffText?: string
 * }
 *
 * Diff source priority:
 * 1. diffText - raw unified diff supplied directly
 * 2. diffFile - read diff from a file
 * 3. git diff - automatically obtain changes from the repository
 */
router.post("/review", async (req, res) => {
  const { repoPath, diffFile, diffText: diffTextBody } =
    req.body || {};

  if (!repoPath) {
    return res.status(400).json({
      error: "repoPath is required",
    });
  }

  try {
    const fs = require("fs");
    const path = require("path");

    const resolvedRepoPath = path.resolve(repoPath);

    // -----------------------------------------
    // 0. Obtain Git diff
    // -----------------------------------------

    let diffText;

    if (diffTextBody) {
      // Use diff supplied directly in the request
      diffText = diffTextBody;
    } else if (diffFile) {
      // Use diff supplied through a file
      diffText = fs.readFileSync(
        path.resolve(diffFile),
        "utf8"
      );
    } else {
      // Automatically obtain current repository changes
      diffText = await getGitDiff(resolvedRepoPath);
    }

    // No changes to review
    if (!diffText || !diffText.trim()) {
      return res.status(200).json({
        message: "No changes found in repository",
        repoStats: {
          fileCount: 0,
          chunkCount: 0,
        },
        overallRisk: {
          score: 0,
          label: "LOW",
          totalIssues: 0,
        },
        fileReviews: [],
        markdown:
          "## 🤖 AI Code Review\n\nNo changes found to review.",
      });
    }

    const ollamaUrl =
      process.env.OLLAMA_URL ||
      "http://localhost:11434/api/generate";

    const model =
      process.env.OLLAMA_MODEL ||
      "qwen2.5-coder:7b";

    const temperature =
      process.env.OLLAMA_TEMPERATURE !== undefined
        ? parseFloat(process.env.OLLAMA_TEMPERATURE)
        : undefined;

    const topK = parseInt(
      process.env.RAG_TOP_K || "5",
      10
    );

    // -----------------------------------------
    // 1. Index repository
    // -----------------------------------------

    const repoIndex = buildRepoIndex(
      resolvedRepoPath
    );

    const tfidfIndex = buildIndex(
      repoIndex.chunks
    );

    // -----------------------------------------
    // 2. Parse the Git diff
    // -----------------------------------------

    const parsedFiles = parseDiff(diffText);

    const changedFiles = parsedFiles.map(
      (file) => file.file
    );

    // -----------------------------------------
    // 3. Run static analysis
    // -----------------------------------------

    const eslintFindings =
      await analyzeRepository(
        resolvedRepoPath,
        changedFiles
      );

    const semgrepFindings =
      await analyzeWithSemgrep(
        resolvedRepoPath,
        changedFiles
      );

    const staticFindings = [
      ...eslintFindings,
      ...semgrepFindings,
    ];

    console.log(
      "\n===== ESLINT FINDINGS ====="
    );
    console.log(eslintFindings);
    console.log("==========================\n");

    console.log(
      "\n===== SEMGREP FINDINGS ====="
    );
    console.log(semgrepFindings);
    console.log("============================\n");

    console.log(
      "\n===== ALL STATIC FINDINGS ====="
    );
    console.log(staticFindings);
    console.log(
      "===============================\n"
    );

    // -----------------------------------------
    // 4. Generate AI review for each changed file
    // -----------------------------------------

    const fileReviews = [];

    for (const parsedFile of parsedFiles) {
      const {
        addedText,
        removedText,
      } = summarizeFileChanges(parsedFile);

      const query =
        `${addedText}\n${removedText}`.trim() ||
        parsedFile.file;

      // Retrieve relevant repository context
      const contextChunks =
        retrieveRelevantChunks(
          query,
          repoIndex.chunks,
          tfidfIndex,
          {
            topK,
            excludeFile: parsedFile.file,
          }
        );

      // Get only static-analysis findings
      // belonging to the current changed file
      const fileStaticFindings =
        staticFindings.filter(
          (finding) =>
            finding.file === parsedFile.file
        );

      console.log(
        `\n===== STATIC FINDINGS FOR ${parsedFile.file} =====`
      );
      console.log(fileStaticFindings);
      console.log(
        "===============================================\n"
      );

      // Send static analysis + RAG context + diff
      // to the AI review generator
      const review =
        await generateReviewForFile(
          {
            file: parsedFile.file,
            addedText,
            removedText,
            contextChunks,
            staticFindings:
              fileStaticFindings,
          },
          {
            ollamaUrl,
            model,
            temperature,
          }
        );

      fileReviews.push(review);
    }

    // -----------------------------------------
    // 5. Calculate overall risk
    // -----------------------------------------

    const overallRisk =
      computeOverallRisk(fileReviews);

    // -----------------------------------------
    // 6. Format final review
    // -----------------------------------------

    const markdown =
      formatReviewAsMarkdown({
        overallRisk,
        fileReviews,
      });

    // -----------------------------------------
    // 7. Return final response
    // -----------------------------------------

    res.json({
      repoStats: {
        fileCount: repoIndex.fileCount,
        chunkCount: repoIndex.chunkCount,
      },
      overallRisk,
      fileReviews,
      markdown,
    });
  } catch (err) {
    console.error(
      "Review generation failed:",
      err
    );

    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;