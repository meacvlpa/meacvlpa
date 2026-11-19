# PACIANA Research Notebook

A source-grounded research workspace for Patristics and theology.

**Motto:** Per fontes ad veritatem.

## Current features

- Responsive notebook interface.
- Upload and extract selectable-text PDF, DOCX, TXT, and Markdown files in the browser.
- PDF extraction preserves page numbers.
- Basic lexical retrieval ranks passages relevant to the question.
- OpenAI Responses API integration through a server-side Vercel Function.
- Strict source-only answering: uploaded excerpts are the exclusive factual authority; the model must not use pretrained/general knowledge to fill gaps.
- AI role is limited to semantic organization, paraphrase, comparison, synthesis, translation when requested, and academic formatting of claims supported by the supplied excerpts.
- Explicit abstention when the supplied sources do not contain sufficient evidence; citations required for substantive claims.
- Research notes saved in the current browser.

## Deploy on Vercel

1. Import `meacvlpa/meacvlpa` from GitHub in Vercel.
2. Set the project framework preset to **Other** if Vercel does not detect a framework.
3. Add `OPENAI_API_KEY` in Project → Settings → Environment Variables. Mark it as a **Secret**, and enable it for Production (and Preview/Development if desired).
4. Optionally add `OPENAI_MODEL` with a model ID enabled for your OpenAI API project. The default is `gpt-4.1-mini`.
5. Redeploy after adding or changing environment variables.
6. Open the deployment URL and upload a text-based document to test the chat.

Never put the OpenAI API key in `app.js`, HTML, or any `NEXT_PUBLIC_*` variable. Do not commit it to GitHub.

## Local development

Use Node.js and the Vercel CLI:

```bash
npm i -g vercel
vercel dev
```

Create a local `.env` file (do not commit it):

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4.1-mini
```

## Current limitations — important for academic use

- This is an early MVP, not yet a full NotebookLM replacement.
- Uploaded document text is extracted in the browser and sent with each question; files are not permanently uploaded to a database.
- Retrieval is basic lexical matching, not embeddings/vector search.
- Scanned PDFs need OCR and are not yet supported.
- PDF page numbers are retained. DOCX, TXT, and Markdown do not have reliable page numbers, so citations identify the source without a page.
- The answer model is explicitly prohibited from adding facts from pretrained/general knowledge and must abstain when the retrieved excerpts are insufficient. This is a prompt-level safeguard, not a mathematical guarantee; verify important claims, quotations, and references against the original edition.
- Retrieval currently uses lexical term matching. A relevant passage may fail to be retrieved if it uses different vocabulary; therefore, an answer that says evidence was not found means it was not found in the retrieved excerpts, not necessarily that no such evidence exists anywhere in the uploaded corpus.
- Notes and notebook selections are currently browser-local; there is no login or cloud synchronization.
- A lightweight per-instance rate limit is included. Add authentication and stronger abuse controls before public launch.

## Planned next stages

1. Persistent notebooks and source storage (Supabase).
2. Embedding-based semantic retrieval and hybrid search.
3. OCR for scanned books and articles.
4. Bibliography metadata (author, title, editor, series, publication, year).
5. Latin/Greek text alignment, translation comparison, and quotation verification.
6. Exportable notes and citation formats.
