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
const MAX_CHUNK_CHARS = 500;
 
// Chunks are produced by repoIndexer.js's chunkFile(), which stores the
// chunk's source text under `text` (see { id, file, startLine, endLine, text }).
function getChunkText(chunk) {
  return chunk.text || "";
}
 
function buildPrompt({ file, addedText, removedText, contextChunks }) {
  const relevantContext = contextChunks
    .slice(0, MAX_CONTEXT_CHUNKS)
    .map((c) => {
      const snippet = getChunkText(c.chunk).slice(0, MAX_CHUNK_CHARS);
      return `--- ${c.chunk.file} ---\n${snippet}`;
    })
    .join("\n\n");
 
  return `
You are a senior software engineer performing a code review.
 
File: ${file}
 
Added Code:
${addedText}
 
Removed Code:
${removedText}
 
Related Context:
${relevantContext}
 
Analyze the change carefully for:
 
- Security vulnerabilities
- Correctness bugs
- Performance problems
- Maintainability problems
- Missing or inadequate tests
 
IMPORTANT REVIEW RULES:
 
1. Only report a real issue that is introduced by or directly related to
   the changed code.
 
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
 
6. For correctness, report only issues that can actually cause incorrect
   program behavior. Multiple return statements are valid JavaScript and
   are NOT automatically a problem.
 
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
 
10. Prefer a false negative over a speculative false positive.
 
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
  { file, addedText, removedText, contextChunks },
  {
    ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL,
    model = process.env.OLLAMA_MODEL || DEFAULT_MODEL,
    temperature = process.env.OLLAMA_TEMPERATURE !== undefined
      ? parseFloat(process.env.OLLAMA_TEMPERATURE)
      : DEFAULT_TEMPERATURE,
  } = {}
) {
  console.log(`[generateReviewForFile] model=${model} temperature=${temperature} file=${file}`);
 
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