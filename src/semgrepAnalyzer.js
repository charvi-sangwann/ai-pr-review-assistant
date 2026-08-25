const { execFile } = require("child_process");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

function runSemgrep(repoPath, changedFiles, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    if (!changedFiles || changedFiles.length === 0) {
      return resolve([]);
    }

    execFile(
      "semgrep",
      ["--config=auto", "--json", ...changedFiles],
      {
        cwd: repoPath,
        maxBuffer: MAX_BUFFER,
        timeout,
      },
      (error, stdout, stderr) => {
        if (error && !stdout) {
          return reject(
            new Error(`Semgrep failed: ${stderr || error.message}`)
          );
        }

        try {
          const results = JSON.parse(stdout);
          resolve(results);
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse Semgrep JSON output: ${parseError.message}`
            )
          );
        }
      }
    );
  });
}

function normalizeSemgrepResults(results, repoPath) {
  const findings = [];

  if (!results || !results.results) {
    return findings;
  }

  for (const result of results.results) {
    const file = path.relative(repoPath, result.path);

    findings.push({
      source: "semgrep",
      file,
      line: result.start?.line || 0,
      column: result.start?.col || 0,
      rule: result.check_id || "unknown",
      severity: normalizeSeverity(result.extra?.severity),
      category: "security",
      message: result.extra?.message || "Semgrep finding",
    });
  }

  return findings;
}

function normalizeSeverity(severity) {
  if (!severity) {
    return "warning";
  }

  const value = severity.toLowerCase();

  if (value === "error") {
    return "error";
  }

  if (value === "warning") {
    return "warning";
  }

  if (value === "info") {
    return "info";
  }

  return "warning";
}

async function analyzeWithSemgrep(repoPath, changedFiles, options = {}) {
  const results = await runSemgrep(repoPath, changedFiles, options);

  return normalizeSemgrepResults(results, repoPath);
}

module.exports = {
  runSemgrep,
  normalizeSemgrepResults,
  analyzeWithSemgrep,
};