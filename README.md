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
5. In the service's Environment settings, add the secret `GEMINI_API_KEY`. Do not put this key in GitHub or in frontend code.
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
| `GEMINI_API_KEY` | Your Gemini API key (secret) |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` |
| `` | (tidak digunakan; retrieval lokal) |
| `GEMINI_VERIFIER_MODEL` | `gpt-4.1-mini` |
| `NODE_ENV` | `production` |

Never expose `GEMINI_API_KEY` in `app.js`, HTML, browser variables, or GitHub commits.

## Current features

- Responsive notebook interface.
- Upload and extract selectable-text PDF, DOCX, TXT, and Markdown files in the browser.
- PDF extraction preserves page numbers.
- Local lexical retrieval ranks only text extracted from user-provided sources; no external embedding service is called.
- Google Gemini API integration through a server-side Express endpoint at `/api/chat`.
- Strict source-only answering: uploaded excerpts are the exclusive factual authority.
- Structured claim-by-claim output with verbatim evidence quotations and source markers.
- Server-side exact-quote verification.
- A second Gemini semantic entailment audit; unsupported, partial, or uncertain claims are rejected.
- A health endpoint at `/health` for deployment monitoring.

## Local development

Requires Node.js 18 or newer.

```bash
npm install
```

Create a local `.env` file (do not commit it) and set:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gpt-4.1-mini
=text-embedding-3-small
GEMINI_VERIFIER_MODEL=gpt-4.1-mini
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
- Retrieval currently uses local lexical ranking. It avoids embedding API charges but is less capable of cross-language semantic matching.
- Scanned PDFs require OCR and are not yet supported.
- PDF page numbers are retained. DOCX, TXT, and Markdown do not have reliable page numbers.
- Exact quote matching confirms that the quotation occurs in retrieved text; it does not prove that the interpretation follows logically.
- Semantic verification is an AI-assisted second opinion, not a formal proof of entailment. Important arguments must still be checked against the original edition.
- Lexical retrieval may miss relevant passages when the question uses different words or languages from the source.
- Notes and notebook selections are currently stored in the browser; there is no login or cloud synchronization.
- The included rate limit is per running server instance. Add authentication and robust abuse controls before a public launch.
- A Render free service may sleep when inactive; first requests after inactivity may take longer. Check Render's current plan details for exact limits.

## Academic evaluation benchmark

A controlled, explicitly fictional semantic-evidence benchmark is available in `tests/`. It includes fully supported, partially supported, contradicted, unrelated, and historically plausible but unstated claims.

Run `npm run check` for syntax and fixture checks. A live model evaluation requires `GEMINI_API_KEY`; see [tests/README.md](tests/README.md).
