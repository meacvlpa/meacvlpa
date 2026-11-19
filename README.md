# PACIANA Research Notebook

A source-grounded research workspace for Patristics and theology.

**Motto:** Per fontes ad veritatem.

## Deploy on Render

This repository is configured as a Node.js web service for [Render](https://render.com/).

### Option A — Blueprint (recommended)

1. Sign in to Render and connect your GitHub account.
2. Choose **New → Blueprint**.
3. Select the repository `meacvlpa/meacvlpa`.
4. Render detects `render.yaml`. Review the service settings and create the service.
5. In the service's Environment settings, add the secret `OPENAI_API_KEY`. Do not put this key in GitHub or in frontend code.
6. Trigger a deploy if Render has not automatically deployed after the secret was added.
7. Open the service URL. Check `/health`; it should return JSON with `ok: true`.

### Option B — create a Web Service manually

- Repository: `meacvlpa/meacvlpa`
- Runtime: **Node**
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

Add these environment variables in Render:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | Your OpenAI API key (secret) |
| `OPENAI_MODEL` | `gpt-4.1-mini` |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` |
| `OPENAI_VERIFIER_MODEL` | `gpt-4.1-mini` |
| `NODE_ENV` | `production` |

Never expose `OPENAI_API_KEY` in `app.js`, HTML, browser variables, or GitHub commits.

## Current features

- Responsive notebook interface.
- Upload and extract selectable-text PDF, DOCX, TXT, and Markdown files in the browser.
- PDF extraction preserves page numbers.
- Hybrid retrieval combines multilingual semantic embeddings with lexical ranking; it falls back to lexical retrieval if embeddings fail.
- OpenAI Responses API integration through a server-side Express endpoint at `/api/chat`.
- Strict source-only answering: uploaded excerpts are the exclusive factual authority.
- Structured claim-by-claim output with verbatim evidence quotations and source markers.
- Server-side exact-quote verification.
- A second semantic entailment audit; unsupported, partial, or uncertain claims are rejected.
- A health endpoint at `/health` for deployment monitoring.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
```

Create a local `.env` file (do not commit it) and set:

```env
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_VERIFIER_MODEL=gpt-4.1-mini
PORT=10000
```

Start the server:

```bash
npm start
```

Open `http://localhost:10000`.

Run static checks:

```bash
npm run check
```

## Important academic and technical limitations

- This is an early MVP, not a complete NotebookLM replacement.
- Uploaded document text is extracted in the browser and sent with each question; files are not permanently stored in a database.
- Embeddings are currently recomputed for the question and all extracted chunks on each request. This adds latency and API cost; persistent embedding storage and caching are future work.
- Scanned PDFs require OCR and are not yet supported.
- PDF page numbers are retained. DOCX, TXT, and Markdown do not have reliable page numbers.
- Exact quote matching confirms that the quotation occurs in retrieved text; it does not prove that the interpretation follows logically.
- Semantic verification is an AI-assisted second opinion, not a formal proof of entailment. Important arguments must still be checked against the original edition.
- Hybrid retrieval improves cross-language discovery but does not guarantee that every relevant passage will be retrieved.
- Notes and notebook selections are currently stored in the browser; there is no login or cloud synchronization.
- The included rate limit is per running server instance. Add authentication and robust abuse controls before a public launch.
- A Render free service may sleep when inactive; first requests after inactivity may take longer. Check Render's current plan details for exact limits.

## Academic evaluation benchmark

A controlled, explicitly fictional semantic-evidence benchmark is available in `tests/`. It includes fully supported, partially supported, contradicted, unrelated, and historically plausible but unstated claims.

Run `npm run check` for syntax and fixture checks. A live model evaluation requires `OPENAI_API_KEY`; see [tests/README.md](tests/README.md).
