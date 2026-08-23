Yes — for GitHub, the README should be clean, concise, and recruiter-friendly, while still showing the important technical depth and the new evaluation work.

AI-Powered Code Review Assistant

An AI-powered code review system that goes beyond reviewing changed lines in isolation.

Instead of only sending a Git diff to an LLM, the system uses RAG to retrieve relevant code from the repository, giving the model additional context to identify security issues, inconsistencies, and bugs that depend on surrounding code.

Built as a local-first MVP using Node.js, TF-IDF retrieval, and Ollama.

⸻

Architecture

Repository + Diff
       │
       ▼
Repository Indexer
       │
       ▼
TF-IDF Retriever (RAG)
       │
       ▼
Relevant Code Context
       │
       ▼
Local LLM (Ollama)
       │
       ▼
Structured Review
       │
       ▼
Risk Scoring
       │
       ▼
Markdown Output

Core Components

* Repository Indexer — walks and chunks source files
* Retriever — TF-IDF + cosine similarity for contextual retrieval
* Diff Parser — extracts changed files and hunks
* Review Generator — sends context + diff to a local LLM
* Risk Scorer — produces a deterministic overall risk score
* Formatter — generates GitHub-style Markdown reviews

⸻

Example

For a change introducing a SQL injection vulnerability:

Changed file:
routes/user.js
Retrieved context:
db.js
utils/auth.js

The retrieved context allows the LLM to understand how the changed code interacts with the rest of the repository instead of reviewing the diff alone.

⸻

Evaluation

The project includes an evaluation framework to measure whether the reviewer is actually useful, rather than only checking whether the pipeline runs.

Evaluation cases test:

* Vulnerability detection
* Retrieval quality
* Missed findings
* False positives
* Risk scoring

This provides a measurable way to evaluate the core claim of the project: whether repository context improves AI-assisted code review.

⸻

Tech Stack

Node.js · Express · RAG · TF-IDF · Cosine Similarity · Ollama · JavaScript · Git

Testing uses Node’s built-in node:test runner.

⸻

Run Locally

npm install
cp .env.example .env

Install Ollama and pull the default model:

ollama pull deepseek-coder:1.3b
ollama serve

Run the CLI:

node cli.js ./test-data/sample-repo ./test-data/sample.diff

Or start the API:

npm start

Run tests:

npm test

⸻

Project Structure

ai-pr-review-assistant/
├── cli.js
├── server.js
├── routes/
│   └── review.js
├── src/
│   ├── repoIndexer.js
│   ├── retriever.js
│   ├── diffParser.js
│   ├── reviewGenerator.js
│   ├── riskScorer.js
│   └── reviewFormatter.js
├── test/
├── evaluation/
└── test-data/

⸻

Roadmap

V1 — AI + RAG MVP — indexer → retriever → LLM → risk score → formatter

V1.1 — Clean, understand & test current pipeline — fix the LLM-backend mismatch, add missing API/config files, build a realistic sample repo + diff, add unit tests, and verify retrieval quality.

V1.2 — Evaluation — add benchmark cases to measure vulnerability detection, retrieval effectiveness, false positives, missed findings, and overall review usefulness.

V2 — Static analysis — run Semgrep / npm audit / Bandit alongside the LLM call and merge their findings into the same issues[] shape for a unified review.

V2.1 — Git diff automation — generate diffs automatically from a local Git repository’s working changes or branch comparison instead of requiring a manually exported .diff file.

V3 — GitHub PR integration — build a GitHub App / webhook receiver that fetches PR diffs, runs the review pipeline, and posts the results back to the pull request.

V4 — Dashboard, history, etc. (only if time remains) — store past reviews, track recurring issues, visualize risk trends, and build a small frontend.

⸻

Why This Project?

The goal isn’t just to make an LLM review code.

The goal is to build a measurable, repository-aware code review system where retrieval, AI analysis, deterministic scoring, and evaluation work together in a modular pipeline.
