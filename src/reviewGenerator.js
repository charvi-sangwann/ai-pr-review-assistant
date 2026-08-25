/**Reviewgenerator · JS
 * Review Generator — calls a local Ollama model to produce a structured
 * code review for a single file's diff, using retrieved repo context.
 *
 * V1.1 decision: standardized on local Ollama (free, no API key, no
 * network egress needed) instead of a paid hosted LLM. If a hosted model
 * is wanted later, this is the only file that needs to change — the rest
 * of the pipeline just consumes { file, summary, riskScore, issues }.
 */

const DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_MODEL = "qwen2.5-coder:7b";
// Low temperature = more deterministic, literal, grounded-in-input output.
// Small local models drift/hallucinate more at default (higher) temperature —
// this trades a little creativity for a lot more run-to-run consistency,
// which matters more for a code review tool than for creative writing.
const DEFAULT_TEMPERATURE = 0.1;

// Caps on how much retrieved repo context gets injected into the prompt.
// Keeps prompt size (and inference time / GPU load) bounded even when
// retrieval returns many/large chunks.
const MAX_CONTEXT_CHUNKS = 4;
const MAX_CHUNK_CHARS = 1000;

// Chunks are produced by repoIndexer.js's chunkFile(), which stores the
// chunk's source text under `text` (see { id, file, startLine, endLine, text }).
function getChunkText(chunk) {
  return chunk.text || "";
}

function buildPrompt({
  file,
  addedText,
  removedText,
  contextChunks,
  staticFindings = [],
}) {
  const relevantContext = contextChunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c) => {
      const snippet = getChunkText(c.chunk).slice(0, MAX_CHUNK_CHARS);
      return `--- ${c.chunk.file} ---\n${snippet}`;
    })
    .join("\n\n");

  console.log("\n===== DEBUG REVIEW =====");
  console.log("FILE:", file);
  console.log("ADDED CODE:\n", addedText);
  console.log("REMOVED CODE:\n", removedText);
  console.log("RELATED CONTEXT:\n", relevantContext);
  console.log("========================\n");

  const staticAnalysis = staticFindings
    .slice(0, 10)
    .map(
      (finding) =>
        `[${finding.source}] ${finding.file}:${finding.line}:${finding.column} | rule=${finding.rule} | category=${finding.category} | severity=${finding.severity} | ${finding.message}`
    )
    .join("\n");

  // NOTE: removedText is now actually inserted below. Previously this
  // section was a hardcoded placeholder string and the model never saw
  // removed code at all — which meant it could never detect a regression
  // like "a null-check was deleted and nothing replaced it" (see Rule 1c).
  const removedCodeSection = removedText && removedText.trim()
    ? removedText
    : "[No code was removed in this change.]";

  return `
You are a senior software engineer performing a code review.

File: ${file}

Changed Code (CURRENT CODE ADDED OR MODIFIED):
${addedText}

Removed Code (code that existed before this change and no longer exists
in the current version — provided ONLY so you can detect regressions
where something safety-critical was deleted and not replaced; see Rule 1c):
${removedCodeSection}

Related Context:
${relevantContext}

Static Analysis Findings:
${staticAnalysis || "No static analysis findings."}

Analyze the change carefully for:

- Security vulnerabilities
- Correctness bugs
- Performance problems
- Maintainability problems
- Missing or inadequate tests

IMPORTANT REVIEW RULES:

1. Only report a real issue that is introduced by or directly related to
   the changed code.

1a. Removed Code does NOT exist in the current version. Do NOT report an
    issue whose only evidence is something present in Removed Code but
    absent from Added Code (e.g. do not say "the old code did X wrong" as
    if X still happens). Evaluate the current behavior of the code, not
    the old behavior.

1b. If Added Code is empty, do not report an issue based on Removed Code,
    UNLESS Rule 1c applies. Otherwise return "issues": [] when Added Code
    is empty.

1c. EXCEPTION to 1a/1b — regressions from deletion: if Removed Code
    contains a null/undefined check, bounds check, input validation,
    sanitization step, error handling, or an authorization/authentication
    check, AND no equivalent protection exists in Added Code or the
    resulting current code, THIS IS a reportable issue. Deleting a safety
    check with nothing replacing it is a real regression, even when
    Added Code is empty or minimal. Report it under whichever category
    fits (correctness or security) based on what was removed.

1d. EXCEPTION to 1a/1b — safety-check deletion regression:
    If Removed Code contains a null/undefined check, bounds check,
    input validation, sanitization step, error handling, or
    authorization/authentication check, and that protection is absent
    from the current code, report the resulting regression.

    IMPORTANT: When Added Code is empty, you MUST still inspect Removed
    Code for deleted safety checks. If the removed check protected an
    operation that can fail or produce incorrect behavior, report the
    resulting current-code behavior as the issue.

    Example:
    Removed Code:
        if (b === 0) {
            return null;
        }

    If the current code performs division using b and the zero check
    has been removed, report a correctness issue because division by
    zero is no longer handled.

    Do NOT return an empty issues array merely because Added Code is
    empty when a safety-critical check was deleted.

2. Do NOT report hypothetical security concerns without evidence in the
   changed code.

3. Do NOT report stylistic preferences as bugs.

4. Do NOT invent vulnerabilities or behavior that is not present in the code.

5. For security, specifically check for:
   - SQL injection
   - command injection
   - path traversal
   - XSS
   - hardcoded secrets
   - missing authentication or authorization
   - unsafe password storage
   - SSRF
   - sensitive information exposed in logs
   - unsafe file uploads

5a. Recognizing SAFE parameterized queries: a query string containing
    positional placeholders ($1, $2, ... or ?) used together with a
    separate array/list of bound parameters (e.g. query("... WHERE id =
    $1", [id])) is the CORRECT, SAFE pattern — this is NOT SQL injection.
    Only flag SQL injection when user input is concatenated or
    interpolated directly into the query string itself (e.g. via +,
    template literals, or string formatting). If Added Code shows the
    placeholder+params-array pattern, do not report SQL injection for it,
    even if Removed Code shows the unsafe concatenated version — that is
    the fix, not the bug.

6. For correctness, report only issues that can actually cause incorrect
   program behavior. Multiple return statements in a function are valid
   JavaScript (only the first one reached executes; the rest are simply
   unreachable) and are NOT a syntax error and NOT automatically a bug.
   Example: a function containing two separate return statements, one
   after another, is valid JS — do not report this as invalid syntax.

7. For testing, consider whether the changed behavior introduces a new
   endpoint, security-sensitive behavior, or important edge case that
   should have corresponding tests. Use the Related Context above to
   check whether a corresponding test file or test case already exists
   before reporting a missing-test issue.

8. For maintainability, report genuinely problematic code organization
   or naming only when it meaningfully reduces readability or makes the
   code harder to maintain.

9. If the change is safe and does not introduce a meaningful issue,
   return an empty issues array.

10. Prefer a false negative over a speculative false positive, EXCEPT
    when Rule 1c applies — a deleted safety check is not speculative.

11. A clean code change MUST result in:
    "issues": []

12. A hardcoded port number or a standard host binding (e.g. listening on
    0.0.0.0 or a fixed port) in server startup/configuration code is NOT
    by itself a security issue. Do not report it unless there is clear
    evidence of an actual vulnerability (e.g. a secret, credential, or
    unsafe binding to a sensitive internal service).

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
  {
    file,
    addedText,
    removedText,
    contextChunks,
    staticFindings = [],
  },
  {
    ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
    model = process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    temperature = process.env.OLLAMA_TEMPERATURE !== undefined
      ? parseFloat(process.env.OLLAMA_TEMPERATURE)
      : DEFAULT_TEMPERATURE,
  } = {}
) {
  console.log(`[generateReviewForFile] model=${model} temperature=${temperature} file=${file}`);

  const prompt = buildPrompt({
    file,
    addedText,
    removedText,
    contextChunks,
    staticFindings,
  });

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
    console.log("\n===== RAW MODEL RESPONSE =====");
    console.log(rawResponse);
    console.log("===============================\n");
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