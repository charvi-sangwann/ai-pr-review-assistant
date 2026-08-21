const SEVERITY_EMOJI = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const RISK_LABEL_EMOJI = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

function sortIssuesBySeverity(issues) {
  return [...issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
}

/**
 * Turns the structured review output into Markdown formatted the way a
 * GitHub PR review comment would look. In v2, this is what gets posted
 * back to GitHub via the Issues/Reviews API instead of just returned here.
 *
 * Defensive by design: a local LLM won't always follow the requested JSON
 * schema perfectly (missing severity/category, etc.), so every field here
 * falls back to something sane instead of throwing.
 */
function formatReviewAsMarkdown({ overallRisk, fileReviews }) {
  const lines = [];
  const riskEmoji = RISK_LABEL_EMOJI[overallRisk.label] || "⚪";

  // --- Header ---
  lines.push(`## 🤖 AI Code Review`);
  lines.push("");
  lines.push(
    `${riskEmoji} **Overall Risk: ${(overallRisk.label || "unknown").toUpperCase()} (${overallRisk.score}/10)**` +
      `  ·  ${fileReviews.length} file(s) reviewed  ·  ${overallRisk.totalIssues} issue(s) found`
  );
  lines.push("");

  if (fileReviews.length === 0) {
    lines.push("_No files were reviewed._");
    return lines.join("\n");
  }

  // --- Summary table (worst risk first) ---
  const sortedReviews = [...fileReviews].sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));

  lines.push("| File | Risk | Issues |");
  lines.push("|---|---|---|");
  for (const review of sortedReviews) {
    const issueCount = review.issues?.length || 0;
    lines.push(`| \`${review.file}\` | ${review.riskScore ?? "–"}/10 | ${issueCount} |`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // --- Per-file detail ---
  for (const review of sortedReviews) {
    lines.push(`### 📄 \`${review.file}\` — Risk: ${review.riskScore ?? "–"}/10`);
    lines.push("");
    lines.push(`> ${review.summary || "_No summary provided._"}`);
    lines.push("");

    if (!review.issues || review.issues.length === 0) {
      lines.push("✅ No issues found.");
      lines.push("");
      continue;
    }

    lines.push(`**Issues (${review.issues.length})**`);
    lines.push("");

    const sortedIssues = sortIssuesBySeverity(review.issues);
    sortedIssues.forEach((issue, i) => {
      const severity = issue.severity || "info";
      const category = issue.category || "uncategorized";
      const emoji = SEVERITY_EMOJI[severity] || "⚪";
      lines.push(`${i + 1}. ${emoji} **${severity.toUpperCase()} · ${category}**`);
      lines.push(`   - **Problem:** ${issue.comment || "_No description provided._"}`);
      if (issue.suggestion) {
        lines.push(`   - **Fix:** ${issue.suggestion}`);
      }
      lines.push("");
    });

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

module.exports = { formatReviewAsMarkdown };