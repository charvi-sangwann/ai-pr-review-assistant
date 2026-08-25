const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Fetches a diff from a local git repository.
 *
 * By default compares working directory + staged changes against HEAD
 * (mode: "working"). Pass mode: "branch" with a baseRef to simulate a
 * PR-style diff (e.g. comparing a feature branch against main) —
 * this is the mode that actually mirrors what GitHub's PR diff API
 * will return once Step 2 (GitHub integration) is built, so tests run
 * against this mode are more representative of production behavior.
 *
 * @param {string} repoPath - path to a local git repository
 * @param {object} options
 * @param {"working"|"branch"} options.mode - "working": diff HEAD vs
 *   working directory (uncommitted changes). "branch": diff baseRef vs
 *   HEAD (simulates a PR diff).
 * @param {string} options.baseRef - required when mode is "branch",
 *   e.g. "main" or "origin/main".
 * @param {number} options.timeout - ms before the git process is killed.
 */
function getGitDiff(repoPath, options = {}) {
  const { mode = "working", baseRef, timeout = DEFAULT_TIMEOUT_MS } = options;

  return new Promise((resolve, reject) => {
    const resolvedPath = path.resolve(repoPath);

    if (!fs.existsSync(resolvedPath)) {
      return reject(new Error(`Repo path does not exist: ${resolvedPath}`));
    }

    if (!fs.existsSync(path.join(resolvedPath, ".git"))) {
      return reject(
        new Error(`Not a git repository (no .git found): ${resolvedPath}`)
      );
    }

    let diffArgs;
    if (mode === "branch") {
      if (!baseRef) {
        return reject(
          new Error('mode "branch" requires options.baseRef (e.g. "main")')
        );
      }
      // Three-dot diff: changes on HEAD since it diverged from baseRef —
      // this is what "PR diff" conventionally means (not a plain two-dot
      // diff, which would include unrelated changes made to baseRef
      // after the branches diverged).
      diffArgs = ["diff", `${baseRef}...HEAD`];
    } else {
      diffArgs = ["diff", "HEAD"];
    }

    execFile(
      "git",
      ["-C", resolvedPath, ...diffArgs],
      { maxBuffer: MAX_BUFFER, timeout },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed && error.signal === "SIGTERM") {
            return reject(new Error("git diff timed out"));
          }

          const message = stderr || error.message;

          if (/unknown revision|bad revision/i.test(message)) {
            return reject(
              new Error(
                `git diff failed: unknown ref. Check that "${
                  mode === "branch" ? baseRef : "HEAD"
                }" exists and has at least one commit. (${message.trim()})`
              )
            );
          }

          return reject(new Error(`git diff failed: ${message.trim()}`));
        }

        // Empty string is a valid, non-error result: no changes.
        resolve(stdout);
      }
    );
  });
}

module.exports = { getGitDiff };