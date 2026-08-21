# AI-Powered Code Review Assistant (MVP — local mode)

An AI code reviewer that doesn't just look at the diff — it retrieves related
code elsewhere in the repository (RAG) and gives that context to an LLM, so
reviews can catch things like "this deviates from how the rest of the
codebase does X" instead of only linting the changed lines in isolation.

This is the **simple first version**: it runs entirely locally against a
repo path + a diff file (no GitHub App / webhook setup required) and calls a
**local LLM via [Ollama](https://ollama.com)** — no API key, no per-call
cost, no network egress needed. It's built so the pipeline architecture —
indexer → retriever → LLM → risk score → formatted output — can be extended
later (GitHub webhooks, static analysis, historical PR memory, a dashboard)
without a rewrite.

## Architecture

```
repoPath + diff
      │
      ▼
Repository Indexer   (src/repoIndexer.js)     — walks the repo, chunks source files
      │
      ▼
Retriever            (src/retriever.js)       — TF-IDF + cosine similarity ("RAG" search)
      │
      ▼
Diff Parser           (src/diffParser.js)     — extracts added/removed lines per file
      │
      ▼
Review Generator      (src/reviewGenerator.js) — local LLM call (Ollama), structured JSON out
      │
      ▼
Risk Scorer           (src/riskScorer.js)     — aggregates per-file risk into a PR score
      │
      ▼
Formatter             (src/reviewFormatter.js) — renders GitHub-PR-comment-style Markdown
```

### Why TF-IDF instead of a "real" embedding model?

Dense embeddings (OpenAI, Voyage AI, etc.) are a straightforward upgrade,
but they cost money per call and need network access. For a first working
version, `retriever.js` builds sparse TF-IDF vectors locally and ranks
chunks by cosine similarity — this is genuinely how retrieval worked before
neural embeddings existed, and it's a fair, honest MVP. Swapping in a real
embedding API later only means rewriting `buildIndex()` /
`retrieveRelevantChunks()`; nothing else in the pipeline changes.

### Why a local LLM (Ollama) instead of a hosted API?

Same reasoning as the retriever: no cost, no key management, works offline.
`reviewGenerator.js` posts to Ollama's `/api/generate` endpoint. If the
model is unreachable or returns unparseable output, the pipeline degrades
gracefully — it still returns a valid review object with a note instead of
crashing the whole run. Swapping in a hosted model later (Claude, GPT, etc.)
only means rewriting `generateReviewForFile()`; the rest of the pipeline
consumes the same `{ file, summary, riskScore, issues }` shape either way.

## Setup

```bash
npm install
cp .env.example .env
```

Then install [Ollama](https://ollama.com) and pull the model this project
defaults to:

```bash
ollama pull deepseek-coder:1.3b
ollama serve   # leave running in a separate terminal
```

(Any Ollama-served model works — just set `OLLAMA_MODEL` in `.env` to
whatever you pulled.)

## Run it

**Option A — HTTP API:**

```bash
npm start
```

```bash
curl -X POST http://localhost:3000/api/review \
  -H "Content-Type: application/json" \
  -d '{
    "repoPath": "./test-data/sample-repo",
    "diffFile": "./test-data/sample.diff"
  }'
```

**Option B — CLI (no server needed):**

```bash
node cli.js ./test-data/sample-repo ./test-data/sample.diff
```

Both read the diff, index `test-data/sample-repo`, retrieve related chunks
(it surfaces `db.js` and `utils/auth.js` as related context for the changed
route file — verified by `test/retrieval.test.js`), call the local model,
and print a structured review with a risk score.

### Trying it on a real diff

```bash
cd /path/to/some/other/repo
git diff main..feature-branch > /tmp/my.diff
cd /path/to/ai-pr-review-assistant
node cli.js /path/to/some/other/repo /tmp/my.diff
```

## Testing

```bash
npm test
```

Runs on Node's built-in test runner (`node:test`), no extra dependencies.
Covers:
- `diffParser` — parses the sample diff correctly, ignores preamble noise
- `repoIndexer` + `retriever` — indexes the sample repo and, critically,
  confirms the RAG step actually surfaces `db.js`/`auth.js` as related
  context for a SQL-injection-shaped diff (the core value prop of this
  project — not just a smoke test)
- `reviewGenerator` — JSON extraction from raw model output, and graceful
  degradation when Ollama is unreachable or returns malformed output
  (mocked `fetch`, no live Ollama server required to run the suite)
- `riskScorer` / `reviewFormatter` — aggregation math and Markdown rendering

## Project layout

```
ai-pr-review-assistant/
├── server.js               # Express entry point
├── cli.js                  # standalone CLI runner
├── routes/review.js        # POST /api/review
├── src/
│   ├── repoIndexer.js      # walk + chunk repo files
│   ├── retriever.js        # TF-IDF retrieval (RAG)
│   ├── diffParser.js       # unified diff → structured hunks
│   ├── reviewGenerator.js  # local LLM call, structured JSON review
│   ├── riskScorer.js       # per-file → overall PR risk score
│   └── reviewFormatter.js  # JSON → GitHub-style Markdown
├── test/                   # node:test unit tests (see above)
├── test-data/
│   ├── sample-repo/        # tiny demo repo (auth util + routes)
│   └── sample.diff         # demo diff (adds a SQL-injection bug on purpose)
└── .env.example
```

## Roadmap

- [x] **V1 — AI + RAG MVP** — indexer → retriever → LLM → risk score → formatter
- [ ] **V1.1 — Clean, understand & test current pipeline** *(current)* —
      fix the LLM-backend mismatch between `cli.js`/README and
      `reviewGenerator.js`, add missing `routes/review.js` and `.env.example`,
      build a real sample repo + diff, add a test suite that actually
      exercises retrieval quality, not just "does it run".
- [ ] **V2 — Static analysis** — run Semgrep / `npm audit` / Bandit
      alongside the LLM call and merge their findings into the same
      `issues[]` shape so everything shows up in one unified review.
- [ ] **V2.1 — Git diff automation** — generate the diff automatically
      (e.g. from a local git repo's working changes or a branch comparison)
      instead of requiring a manually exported `.diff` file.
- [ ] **V3 — GitHub PR integration** — a GitHub App / webhook receiver
      that clones the repo, fetches the PR diff via the GitHub API, and
      posts `markdown` back as a PR review comment.
- [ ] **V4 — Dashboard, history, etc.** (only if time remains) — store past
      reviews (e.g. in Postgres), track recurring issues, and build a small
      frontend showing risk trends over time.

## Notes for the resume writeup

Things worth calling out about this project when you write it up:
- Implements a RAG pipeline (indexing, chunking, retrieval, augmented
  generation) from first principles rather than a framework, so you can
  explain every step.
- Structured-output prompting: the LLM is constrained to return parseable
  JSON so downstream consumers (risk scoring, formatting, and eventually a
  dashboard) don't depend on parsing free-form prose.
- Deterministic risk aggregation on top of a non-deterministic LLM call —
  a common real-world pattern for building reliable systems on top of LLMs.
- Chose a local-first stack (TF-IDF retrieval + Ollama) deliberately to
  keep the MVP free to run and demo, with a documented swap-in path to
  hosted embeddings/LLMs as a v2 upgrade rather than a rewrite.
