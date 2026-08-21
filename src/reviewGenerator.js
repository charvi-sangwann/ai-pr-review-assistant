/**
 * Review Generator — calls a local Ollama model to produce a structured
 * code review for a single file's diff, using retrieved repo context.
 *
 * V1.1 decision: standardized on local Ollama (free, no API key, no
 * network egress needed) instead of a paid hosted LLM. If a hosted model
 * is wanted later, this is the only file that needs to change — the rest
 * of the pipeline just consumes { file, summary, riskScore, issues }.
 */

const DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_MODEL = "deepseek-coder:1.3b";
// Low temperature = more deterministic, literal, grounded-in-input output.
// Small local models drift/hallucinate more at default (higher) temperature —
// this trades a little creativity for a lot more run-to-run consistency,
// which matters more for a code review tool than for creative writing.
const DEFAULT_TEMPERATURE = 0.1;

function buildPrompt({ file, addedText, removedText, contextChunks }) {
  return `
You are a senior software engineer performing a code review.

File: ${file}

Added Code:
${addedText}

Removed Code:
${removedText}

Related Context:
${contextChunks.map((c) => c.chunk.file).join(", ")}

Analyze the change for:
- Security issues
- Correctness bugs
- Performance problems
- Maintainability issues
- Missing tests

Return ONLY valid JSON.

IMPORTANT:
- Do NOT write comments.
- Do NOT use // anywhere.
- Do NOT use /* */ anywhere.
- Do NOT include explanations.
- Do NOT include markdown.
- riskScore must be an integer from 1 to 10.
- severity must be exactly "high", "medium", or "low".
- category must be exactly one of "security", "correctness", "performance", "maintainability", or "testing".
- If there are no issues, return an empty issues array.
- Return exactly one JSON object.

"suggestion" MUST be a description of the code-level fix (e.g. what to
change, which function/pattern to use instead), written as advice to the
developer. NEVER put an attack payload, exploit string, malicious input
example, or proof-of-concept in "suggestion" — that belongs in "comment"
only, briefly, if at all.

Example of a CORRECT suggestion for a SQL injection issue:
"suggestion": "Use a parameterized query, e.g. query('SELECT * FROM users WHERE name = $1', [name]), instead of concatenating the input into the SQL string."

Example of an INCORRECT suggestion (never do this):
"suggestion": "' OR 1=1 --"

Use this structure:

{
  "summary": "short summary",
  "riskScore": 5,
  "issues": [
    {
      "severity": "high",
      "category": "security",
      "comment": "issue description",
      "suggestion": "recommended code-level fix, not an exploit example"
    }
  ]
}

Return JSON only.
`;
}

/**
 * Pull the first {...} JSON object out of a raw model response, stripping
 * markdown code fences the model sometimes wraps output in anyway.
 */
function extractJsonObject(rawText) {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/```json/g, "").replace(/```/g, "").trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in model response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Patterns that indicate the model put an attack payload in "suggestion"
// instead of remediation advice, despite the prompt telling it not to.
// Small local models don't always follow instructions reliably, so this
// is a cheap safety net rather than a replacement for prompt tuning.
const EXPLOIT_LIKE_PATTERNS = [
  /'\s*or\s+1\s*=\s*1/i, // classic ' OR 1=1 --
  /<script/i, // XSS payload
  /drop\s+table/i,
  /union\s+select/i,
  /--\s*$/, // trailing SQL comment used to truncate a query
];

function looksLikeExploitPayload(text) {
  if (typeof text !== "string") return false;
  return EXPLOIT_LIKE_PATTERNS.some((re) => re.test(text));
}

/**
 * Defensively clean up issues returned by the model: drop suggestions that
 * look like exploit payloads rather than fixes (see EXPLOIT_LIKE_PATTERNS).
 */
function sanitizeIssues(issues) {
  return (issues || []).map((issue) => {
    if (looksLikeExploitPayload(issue.suggestion)) {
      console.warn(`[sanitizeIssues] Flagged suggestion: ${JSON.stringify(issue.suggestion)}`);
      return {
        ...issue,
        suggestion:
          "Model returned a possible exploit example instead of a fix suggestion; omitted. See comment for the issue description.",
      };
    }
    return issue;
  });
}

async function generateReviewForFile(
  { file, addedText, removedText, contextChunks },
  {
    ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
    model = process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    temperature = process.env.OLLAMA_TEMPERATURE !== undefined
      ? parseFloat(process.env.OLLAMA_TEMPERATURE)
      : DEFAULT_TEMPERATURE,
  } = {}
) {
  const prompt = buildPrompt({ file, addedText, removedText, contextChunks });

  let rawResponse;
  try {
    const response = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    rawResponse = data.response;
  } catch (err) {
    return {
      file,
      summary: `Review unavailable: could not reach local model (${err.message}). Is 'ollama serve' running?`,
      riskScore: 5,
      issues: [],
    };
  }

  try {
    const review = extractJsonObject(rawResponse);
    return {
      file,
      summary: review.summary,
      riskScore: review.riskScore,
      issues: sanitizeIssues(review.issues),
    };
  } catch (err) {
    console.error(`Failed to parse model response for ${file}: ${err.message}`);
    console.error(rawResponse);
    return {
      file,
      summary: "Unable to parse AI review",
      riskScore: 5,
      issues: [],
    };
  }
}

module.exports = { generateReviewForFile, buildPrompt, extractJsonObject, sanitizeIssues };