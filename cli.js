#!/usr/bin/env node

require("dotenv").config();

const path = require("path");

const { buildRepoIndex } = require("./src/repoIndexer");
const { buildIndex, retrieveRelevantChunks } = require("./src/retriever");
const { parseDiff, summarizeFileChanges } = require("./src/diffParser");
const { generateReviewForFile } = require("./src/reviewGenerator");
const { analyzeRepository } = require("./src/staticAnalyzer");
const { analyzeWithSemgrep } = require("./src/semgrepAnalyzer");
const { computeOverallRisk } = require("./src/riskScorer");
const { formatReviewAsMarkdown } = require("./src/reviewFormatter");
const { getGitDiff } = require("./src/gitDiff");

async function main() {
  const [, , repoPathArg, baseRef] = process.argv;

  if (!repoPathArg) {
    console.error("Usage:");
    console.error("  node cli.js <repoPath>");
    console.error("  node cli.js <repoPath> <baseBranch>");
    console.error("");
    console.error("Examples:");
    console.error("  node cli.js .");
    console.error("  node cli.js . main");
    process.exit(1);
  }

  const resolvedRepoPath = path.resolve(repoPathArg);

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

  console.log("\n🤖 AI PR Review Assistant");
  console.log("==========================");
  console.log(`Repository: ${resolvedRepoPath}`);
  console.log(`Model: ${model}`);

  // -----------------------------------------
  // 1. Get Git diff
  // -----------------------------------------

  console.log("\n🔍 Getting Git diff...");

  const diffText = await getGitDiff(
    resolvedRepoPath,
    baseRef
      ? {
          mode: "branch",
          baseRef,
        }
      : {
          mode: "working",
        }
  );

  if (!diffText.trim()) {
    console.log("\n✅ No changes found to review.");
    return;
  }

  console.log(
    `Diff size: ${diffText.length.toLocaleString()} characters`
  );

  // -----------------------------------------
  // 2. Index repository
  // -----------------------------------------

  console.log("\n📚 Indexing repository...");

  const repoIndex = buildRepoIndex(resolvedRepoPath);
  const tfidfIndex = buildIndex(repoIndex.chunks);

  console.log(
    `Indexed ${repoIndex.fileCount} files / ${repoIndex.chunkCount} chunks`
  );

  // -----------------------------------------
  // 3. Parse diff
  // -----------------------------------------

  const parsedFiles = parseDiff(diffText);

  console.log(
    `\n📝 Changed files: ${parsedFiles.length}`
  );

  parsedFiles.forEach((file) => {
    console.log(`   - ${file.file}`);
  });

  const changedFiles = parsedFiles.map(
    (file) => file.file
  );

  // -----------------------------------------
  // 4. Static analysis
  // -----------------------------------------

  console.log("\n🔎 Running static analysis...");

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
    `ESLint findings: ${eslintFindings.length}`
  );

  console.log(
    `Semgrep findings: ${semgrepFindings.length}`
  );

  // -----------------------------------------
  // 5. AI review
  // -----------------------------------------

  console.log("\n🧠 Running AI review...\n");

  const fileReviews = [];

  for (const parsedFile of parsedFiles) {
    const {
      addedText,
      removedText,
    } = summarizeFileChanges(parsedFile);

    const query =
      `${addedText}\n${removedText}`.trim() ||
      parsedFile.file;

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

    const fileStaticFindings =
      staticFindings.filter(
        (finding) =>
          finding.file === parsedFile.file
      );

    console.log(
      `Reviewing ${parsedFile.file}...`
    );

    const review =
      await generateReviewForFile(
        {
          file: parsedFile.file,
          addedText,
          removedText,
          contextChunks,
          staticFindings: fileStaticFindings,
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
  // 6. Overall risk
  // -----------------------------------------

  const overallRisk =
    computeOverallRisk(fileReviews);

  // -----------------------------------------
  // 7. Format
  // -----------------------------------------

  const markdown =
    formatReviewAsMarkdown({
      overallRisk,
      fileReviews,
    });

  console.log("\n");
  console.log(markdown);

  console.log("\n==========================");
  console.log("Review complete.");
  console.log("==========================\n");
}

main().catch((err) => {
  console.error("\n❌ Review failed:");
  console.error(err.message);
  process.exit(1);
});