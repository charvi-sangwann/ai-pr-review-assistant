const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 10 * 1024 * 1024;

// Maps ESLint rule IDs to review categories. Extend as needed —
// anything not listed falls back to "style".
const RULE_CATEGORY_MAP = {
  // correctness / likely bugs
  "no-undef": "correctness",
  "no-unreachable": "correctness",
  "no-dupe-keys": "correctness",
  "no-const-assign": "correctness",
  "no-cond-assign": "correctness",
  "use-isnan": "correctness",
  "valid-typeof": "correctness",
  // security-adjacent
  "no-eval": "security",
  "no-implied-eval": "security",
  "no-new-func": "security",
  "no-script-url": "security",
  // style / formatting
  indent: "style",
  quotes: "style",
  semi: "style",
  "comma-dangle": "style",
  "no-unused-vars": "style",
};

function categorizeRule(ruleId) {
  if (!ruleId) return "other";
  return RULE_CATEGORY_MAP[ruleId] || "style";
}

/**
 * Resolves a usable ESLint invocation for the given repo.
 * Prefers the repo's local install; falls back to a global `eslint`
 * on PATH; never silently shells out to npx (which can hang trying
 * to download a package in offline/CI/sandboxed environments).
 */
function resolveESLintCommand(repoPath) {
  const localBin = path.join(
    repoPath,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "eslint.cmd" : "eslint"
  );

  if (fs.existsSync(localBin)) {
    return { command: localBin, args: [] };
  }

  return { command: "eslint", args: [] };
}

/**
 * Ensures every path in `changedFiles` resolves to a location inside
 * `repoPath`. Throws on any path that would escape the repo root
 * (e.g. via "../" traversal), since changedFiles is ultimately
 * derived from PR diff content and should be treated as untrusted.
 * Returns the list of validated, repo-relative paths (unchanged),
 * for use as CLI args.
 */
function validateChangedFiles(repoPath, changedFiles) {
  const resolvedRepoRoot = path.resolve(repoPath);

  for (const file of changedFiles) {
    const resolved = path.resolve(resolvedRepoRoot, file);
    const relative = path.relative(resolvedRepoRoot, resolved);

    const escapesRoot =
      relative.startsWith("..") || path.isAbsolute(relative);

    if (escapesRoot) {
      throw new Error(
        `Refusing to analyze path outside repo root: "${file}"`
      );
    }
  }

  return changedFiles;
}

/**
 * Distinguishes "ESLint ran and found problems" (exit code 1, valid
 * JSON on stdout — not an error) from genuine failures: missing
 * binary, broken config, plugin errors, timeouts, etc.
 */
function classifyExecError(error, stdout, stderr) {
  if (!error) return null;

  // ESLint exits 1 when there are lint findings. That's success for
  // our purposes as long as stdout parses as JSON — handled by the
  // caller after this check. Exit code 2 means ESLint itself failed
  // to run (bad config, missing plugin, etc).
  if (error.killed && error.signal === "SIGTERM") {
    return new Error("ESLint timed out");
  }

  if (error.code === "ENOENT") {
    return new Error(
      "ESLint binary not found. Ensure ESLint is installed in the target repo " +
        "(node_modules/.bin/eslint) or available globally on PATH."
    );
  }

  if (error.code === 2) {
    return new Error(
      `ESLint failed to run, likely a config or plugin error: ${
        stderr || stdout || error.message
      }`
    );
  }

  // Exit code 1 with no stdout at all is still a real failure.
  if (!stdout) {
    return new Error(`ESLint failed: ${stderr || error.message}`);
  }

  return null; // treat as "ran with findings", let JSON parsing decide
}

function runESLint(repoPath, changedFiles, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    if (!changedFiles || changedFiles.length === 0) {
      return resolve([]);
    }

    let validatedFiles;
    try {
      validatedFiles = validateChangedFiles(repoPath, changedFiles);
    } catch (validationError) {
      return reject(validationError);
    }

    const { command, args } = resolveESLintCommand(repoPath);

    execFile(
      command,
      [...args, "--format", "json", ...validatedFiles],
      {
        cwd: repoPath,
        maxBuffer: MAX_BUFFER,
        timeout,
      },
      (error, stdout, stderr) => {
        const classifiedError = classifyExecError(error, stdout, stderr);
        if (classifiedError) {
          return reject(classifiedError);
        }

        try {
          const results = JSON.parse(stdout);
          resolve(results);
        } catch (parseError) {
          reject(
            new Error(
              `Failed to parse ESLint JSON output: ${parseError.message}`
            )
          );
        }
      }
    );
  });
}

function normalizeESLintResults(results, repoPath) {
  const findings = [];

  for (const result of results) {
    if (!result.messages || result.messages.length === 0) {
      continue;
    }

    const file = path.relative(repoPath, result.filePath);

    for (const message of result.messages) {
      findings.push({
        source: "eslint",
        file,
        line: message.line,
        column: message.column,
        rule: message.ruleId,
        severity: message.severity === 2 ? "error" : "warning",
        category: categorizeRule(message.ruleId),
        message: message.message,
      });
    }
  }

  return findings;
}

async function analyzeRepository(repoPath, changedFiles, options = {}) {
  const results = await runESLint(repoPath, changedFiles, options);
  return normalizeESLintResults(results, repoPath);
}

module.exports = {
  runESLint,
  normalizeESLintResults,
  analyzeRepository,
  validateChangedFiles,
  resolveESLintCommand,
  categorizeRule,
};