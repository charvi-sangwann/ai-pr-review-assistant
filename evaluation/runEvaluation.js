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

        const detectedCategories = [
          ...new Set(
            issues
              .map((issue) => issue.category)
              .filter(Boolean)
          ),
        ];

        const detectedSeverities = [
          ...new Set(
            issues
              .map((issue) => issue.severity)
              .filter(Boolean)
          ),
        ];

        /*
         * Detection
         *
         * Positive case:
         *   expectedIssue = true
         *   actual issue = true
         *
         * Negative case:
         *   expectedIssue = false
         *   actual issue = false
         */
        const detectionPassed =
          issueDetected === testCase.expectedIssue;

        /*
         * Severity
         *
         * Correct if at least one detected issue
         * has the expected severity.
         */
        const severityMatched =
          testCase.expectedSeverity === null
            ? null
            : detectedSeverities.includes(
                testCase.expectedSeverity
              );

        /*
         * Category
         *
         * Correct if at least one detected issue
         * has the expected category.
         */
        const categoryMatched =
          testCase.category === null
            ? null
            : detectedCategories.includes(
                testCase.category
              );

        return {
          id: testCase.id,
          scenario: testCase.scenario,

          expectedIssue: testCase.expectedIssue,
          expectedSeverity: testCase.expectedSeverity,
          expectedCategory: testCase.category,

          issueDetected,

          detectedSeverities,
          detectedCategories,
          detectedIssues: issues,

          detectionPassed,
          severityMatched,
          categoryMatched,

          passed: detectionPassed,

          status: "completed",
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? `Request timed out after ${
              TIMEOUT_MS / 1000
            } seconds`
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

function calculateMetrics(results) {
  const completed = results.filter(
    (result) => result.status === "completed"
  );

  const positiveCases = completed.filter(
    (result) => result.expectedIssue === true
  );

  const negativeCases = completed.filter(
    (result) => result.expectedIssue === false
  );

  const truePositives = positiveCases.filter(
    (result) => result.issueDetected
  ).length;

  const falseNegatives = positiveCases.filter(
    (result) => !result.issueDetected
  ).length;

  const trueNegatives = negativeCases.filter(
    (result) => !result.issueDetected
  ).length;

  const falsePositives = negativeCases.filter(
    (result) => result.issueDetected
  ).length;

  const detectionAccuracy =
    completed.length === 0
      ? 0
      : (completed.filter(
          (result) => result.detectionPassed
        ).length /
          completed.length) *
        100;

  const severityCases = positiveCases.filter(
    (result) =>
      result.issueDetected &&
      result.expectedSeverity !== null
  );

  const severityCorrect = severityCases.filter(
    (result) => result.severityMatched
  ).length;

  const severityAccuracy =
    severityCases.length === 0
      ? 0
      : (severityCorrect / severityCases.length) * 100;

  const categoryCases = positiveCases.filter(
    (result) =>
      result.issueDetected &&
      result.expectedCategory !== null
  );

  const categoryCorrect = categoryCases.filter(
    (result) => result.categoryMatched
  ).length;

  const categoryAccuracy =
    categoryCases.length === 0
      ? 0
      : (categoryCorrect / categoryCases.length) * 100;

  const falsePositiveRate =
    negativeCases.length === 0
      ? 0
      : (falsePositives / negativeCases.length) * 100;

  const precision =
    truePositives + falsePositives === 0
      ? 0
      : (truePositives /
          (truePositives + falsePositives)) *
        100;

  const recall =
    truePositives + falseNegatives === 0
      ? 0
      : (truePositives /
          (truePositives + falseNegatives)) *
        100;

  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) /
        (precision + recall);

  return {
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,

    detectionAccuracy: Number(
      detectionAccuracy.toFixed(2)
    ),

    precision: Number(
      precision.toFixed(2)
    ),

    recall: Number(
      recall.toFixed(2)
    ),

    f1Score: Number(
      f1.toFixed(2)
    ),

    falsePositiveRate: Number(
      falsePositiveRate.toFixed(2)
    ),

    severityAccuracy: Number(
      severityAccuracy.toFixed(2)
    ),

    categoryAccuracy: Number(
      categoryAccuracy.toFixed(2)
    ),

    severityCases: severityCases.length,
    categoryCases: categoryCases.length,
  };
}

function calculateCategoryMetrics(results) {
  const categories = [
    ...new Set(
      results
        .filter(
          (result) =>
            result.status === "completed" &&
            result.expectedCategory
        )
        .map(
          (result) => result.expectedCategory
        )
    ),
  ];

  const metrics = {};

  for (const category of categories) {
    const categoryResults = results.filter(
      (result) =>
        result.status === "completed" &&
        result.expectedCategory === category
    );

    const passed = categoryResults.filter(
      (result) => result.detectionPassed
    ).length;

    metrics[category] = {
      total: categoryResults.length,
      passed,
      failed:
        categoryResults.length - passed,
      accuracy: Number(
        (
          (passed / categoryResults.length) *
          100
        ).toFixed(2)
      ),
    };
  }

  return metrics;
}

async function main() {
  const benchmark = JSON.parse(
    fs.readFileSync(CASES_FILE, "utf8")
  );

  /*
   * --------------------------------------------------
   * CASE FILTERING
   * --------------------------------------------------
   *
   * No arguments:
   *
   *   node evaluation/runEvaluation.js
   *
   * Runs all cases.
   *
   * One argument:
   *
   *   node evaluation/runEvaluation.js COR-04
   *
   * Runs only COR-04.
   *
   * Multiple arguments:
   *
   *   node evaluation/runEvaluation.js COR-04 CLEAN-01 CLEAN-02 CLEAN-04
   *
   * Runs only those cases.
   */

  const requestedCaseIds = process.argv.slice(2);

  let casesToRun = benchmark.cases;

  if (requestedCaseIds.length > 0) {
    casesToRun = benchmark.cases.filter(
      (testCase) =>
        requestedCaseIds.includes(testCase.id)
    );

    const foundIds = casesToRun.map(
      (testCase) => testCase.id
    );

    const missingIds =
      requestedCaseIds.filter(
        (id) => !foundIds.includes(id)
      );

    if (missingIds.length > 0) {
      console.error(
        `Unknown evaluation case(s): ${missingIds.join(
          ", "
        )}`
      );

      console.error(
        "\nAvailable cases:"
      );

      console.error(
        benchmark.cases
          .map((testCase) => testCase.id)
          .join(", ")
      );

      process.exit(1);
    }
  }

  console.log(
    `Running ${casesToRun.length} evaluation case(s)...\n`
  );

  const results = [];

  for (
    let i = 0;
    i < casesToRun.length;
    i++
  ) {
    const testCase = casesToRun[i];

    console.log(
      `Running ${testCase.id} — ${testCase.scenario}`
    );

    const result = await runCase(testCase);

    results.push(result);

    if (result.status === "completed") {
      console.log(
        `  Expected issue: ${result.expectedIssue}`
      );

      console.log(
        `  AI detected:    ${result.issueDetected}`
      );

      if (result.expectedSeverity !== null) {
        console.log(
          `  Expected severity: ${result.expectedSeverity}`
        );

        console.log(
          `  Severity match:    ${
            result.severityMatched
              ? "YES"
              : "NO"
          }`
        );
      }

      if (result.expectedCategory !== null) {
        console.log(
          `  Expected category: ${result.expectedCategory}`
        );

        console.log(
          `  Category match:    ${
            result.categoryMatched
              ? "YES"
              : "NO"
          }`
        );
      }

      console.log(
        `  Detection: ${
          result.detectionPassed
            ? "PASS"
            : "FAIL"
        }\n`
      );
    } else {
      console.log(
        `  ${result.status}: ${
          result.reason || result.error
        }\n`
      );
    }

    /*
     * Wait between cases.
     *
     * Importantly, we do NOT wait after the
     * final selected case.
     */
    if (i < casesToRun.length - 1) {
      console.log(
        `  Waiting ${
          DELAY_MS / 1000
        } seconds before next case...\n`
      );

      await new Promise(
        (resolve) => {
          setTimeout(
            resolve,
            DELAY_MS
          );
        }
      );
    }
  }

  const completed = results.filter(
    (result) =>
      result.status === "completed"
  );

  const passed = completed.filter(
    (result) =>
      result.detectionPassed
  );

  const metrics =
    calculateMetrics(results);

  const categoryMetrics =
    calculateCategoryMetrics(
      results
    );

  const summary = {
    totalCases: casesToRun.length,

    completedCases:
      completed.length,

    passedCases:
      passed.length,

    failedCases:
      completed.length -
      passed.length,

    skippedCases:
      results.filter(
        (result) =>
          result.status === "skipped"
      ).length,

    errorCases:
      results.filter(
        (result) =>
          result.status === "error"
      ).length,

    ...metrics,

    byCategory:
      categoryMetrics,
  };

  const output = {
    benchmark:
      benchmark.benchmark,

    version:
      benchmark.version,

    generatedAt:
      new Date().toISOString(),

    selectedCases:
      requestedCaseIds.length > 0
        ? requestedCaseIds
        : "all",

    summary,

    results,
  };

  const outputFile = path.join(
    __dirname,
    "results.json"
  );

  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      output,
      null,
      2
    )
  );

  console.log(
    "\n================================="
  );

  console.log(
    "AI PR REVIEW EVALUATION"
  );

  console.log(
    "================================="
  );

  console.log(
    `Total cases:          ${summary.totalCases}`
  );

  console.log(
    `Completed:            ${summary.completedCases}`
  );

  console.log(
    `Detection accuracy:   ${summary.detectionAccuracy}%`
  );

  console.log(
    `Precision:             ${summary.precision}%`
  );

  console.log(
    `Recall:                ${summary.recall}%`
  );

  console.log(
    `F1 score:              ${summary.f1Score}%`
  );

  console.log(
    `False positive rate:   ${summary.falsePositiveRate}%`
  );

  console.log(
    `Severity accuracy:     ${summary.severityAccuracy}%`
  );

  console.log(
    `Category accuracy:     ${summary.categoryAccuracy}%`
  );

  console.log(
    "\nConfusion Matrix:"
  );

  console.log(
    `  True positives:      ${summary.truePositives}`
  );

  console.log(
    `  False positives:     ${summary.falsePositives}`
  );

  console.log(
    `  True negatives:      ${summary.trueNegatives}`
  );

  console.log(
    `  False negatives:     ${summary.falseNegatives}`
  );

  console.log(
    "\nBy Category:"
  );

  for (
    const [
      category,
      data,
    ] of Object.entries(
      summary.byCategory
    )
  ) {
    console.log(
      `  ${category}: ${data.passed}/${data.total} (${data.accuracy}%)`
    );
  }

  console.log(
    `\nResults saved to: ${outputFile}`
  );
}

main();