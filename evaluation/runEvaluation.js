const fs = require("fs");
const path = require("path");

const CASES_FILE = path.join(__dirname, "cases.json");
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const API_URL = "http://localhost:3000/api/review";

const MAX_ATTEMPTS = 2;
const TIMEOUT_MS = 60_000;
const DELAY_MS = 5_000;

async function runCase(testCase) {
  const fixtureDir = path.join(FIXTURES_DIR, testCase.id);
  const repoPath = path.join(fixtureDir, "repo");
  const diffFile = path.join(fixtureDir, "change.diff");

  if (!fs.existsSync(repoPath)) {
    return {
      id: testCase.id,
      status: "skipped",
      reason: "Repository fixture not found",
    };
  }

  if (!fs.existsSync(diffFile)) {
    return {
      id: testCase.id,
      status: "skipped",
      reason: "Diff fixture not found",
    };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`  Attempt ${attempt}/${MAX_ATTEMPTS}`);

      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            repoPath,
            diffFile,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API returned ${response.status}`);
        }

        const review = await response.json();

        const issues = (review.fileReviews || []).flatMap(
          (fileReview) => fileReview.issues || []
        );

        const issueDetected = issues.length > 0;

        return {
          id: testCase.id,
          expectedIssue: testCase.expectedIssue,
          expectedSeverity: testCase.expectedSeverity,
          issueDetected,
          detectedIssues: issues,
          passed: issueDetected === testCase.expectedIssue,
          status: "completed",
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? `Request timed out after ${TIMEOUT_MS / 1000} seconds`
          : error.message;

      if (attempt < MAX_ATTEMPTS) {
        console.log(`  ${message}`);
        console.log("  Retrying...");
      } else {
        return {
          id: testCase.id,
          status: "error",
          error: message,
        };
      }
    }
  }
}

async function main() {
  const benchmark = JSON.parse(
    fs.readFileSync(CASES_FILE, "utf8")
  );

  console.log(
    `Running ${benchmark.cases.length} evaluation cases...\n`
  );

  const results = [];

  for (let i = 0; i < benchmark.cases.length; i++) {
    const testCase = benchmark.cases[i];

    console.log(`Running ${testCase.id}...`);

    const result = await runCase(testCase);

    results.push(result);

    if (result.status === "completed") {
      console.log(
        `  Expected issue: ${result.expectedIssue}`
      );

      console.log(
        `  AI detected issue: ${result.issueDetected}`
      );

      console.log(
        `  Result: ${result.passed ? "PASS" : "FAIL"}\n`
      );
    } else {
      console.log(
        `  ${result.status}: ${result.reason || result.error}\n`
      );
    }

    // Give Ollama/GPU a short break between cases.
    if (i < benchmark.cases.length - 1) {
      console.log(
        `  Waiting ${DELAY_MS / 1000} seconds before next case...\n`
      );

      await new Promise((resolve) => {
        setTimeout(resolve, DELAY_MS);
      });
    }
  }

  const completed = results.filter(
    (result) => result.status === "completed"
  );

  const passed = completed.filter(
    (result) => result.passed
  );

  const summary = {
    totalCases: benchmark.cases.length,
    completedCases: completed.length,
    passedCases: passed.length,
    failedCases: completed.length - passed.length,
    skippedCases: results.filter(
      (result) => result.status === "skipped"
    ).length,
    errorCases: results.filter(
      (result) => result.status === "error"
    ).length,
  };

  const output = {
    benchmark: benchmark.benchmark,
    version: benchmark.version,
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };

  const outputFile = path.join(
    __dirname,
    "results.json"
  );

  fs.writeFileSync(
    outputFile,
    JSON.stringify(output, null, 2)
  );

  console.log("=================================");
  console.log("Evaluation complete");
  console.log("=================================");

  console.log(
    `Total cases:     ${summary.totalCases}`
  );

  console.log(
    `Completed:       ${summary.completedCases}`
  );

  console.log(
    `Passed:          ${summary.passedCases}`
  );

  console.log(
    `Failed:          ${summary.failedCases}`
  );

  console.log(
    `Skipped:         ${summary.skippedCases}`
  );

  console.log(
    `Errors:          ${summary.errorCases}`
  );

  console.log(
    `\nResults saved to: ${outputFile}`
  );
}

main();