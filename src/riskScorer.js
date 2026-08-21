const SEVERITY_WEIGHT = { critical: 10, high: 6, medium: 3, low: 1, info: 0 };

/**
 * Combine per-file LLM-assigned risk scores with a simple size/severity
 * heuristic into one overall PR risk score (1-10) plus a letter-style label.
 * Keeping this deterministic (rather than asking the LLM for the PR-wide
 * number directly) makes the dashard trends in v2 comparable across PRs.
 */
function computeOverallRisk(fileReviews) {
  if (fileReviews.length === 0) {
    return { score: 1, label: "low", totalIssues: 0 };
  }

  let issueWeightSum = 0;
  let totalIssues = 0;
  let maxFileRisk = 0;

  for (const review of fileReviews) {
    maxFileRisk = Math.max(maxFileRisk, review.riskScore || 0);
    for (const issue of review.issues || []) {
      issueWeightSum += SEVERITY_WEIGHT[issue.severity] ?? 1;
      totalIssues += 1;
    }
  }

  // Blend: worst single-file LLM score carries the most weight, with a
  // bump from accumulated issue severity across the whole PR.
  const blended = Math.round(maxFileRisk * 0.7 + Math.min(issueWeightSum, 30) / 3);
  const score = Math.max(1, Math.min(10, blended));

  let label = "low";
  if (score >= 8) label = "critical";
  else if (score >= 6) label = "high";
  else if (score >= 3) label = "medium";

  return { score, label, totalIssues };
}

module.exports = { computeOverallRisk };
