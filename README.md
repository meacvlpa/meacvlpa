# PACIANA Research Notebook

A research workspace for Patristic and theological studies, inspired by source-grounded AI notebook workflows.

**Motto:** Per fontes ad veritatem.

## Current MVP

- Responsive research notebook interface
- Local document selection and source list (metadata only)
- Research notes saved in browser local storage
- Notebook creation in the current browser session
- AI chat interface placeholder

## Important limitations

This is an initial frontend prototype. It does **not** yet extract document text, persist uploaded files, or generate AI answers. The current source list displays selected file metadata only. Research notes are stored locally in the browser.

## Planned development

1. Secure backend and AI provider integration (API keys must remain server-side).
2. PDF and DOCX text extraction, OCR for scanned documents, and page-aware chunking.
3. Retrieval-augmented generation (RAG) with source-grounded answers and page citations.
4. Notebook and source persistence with authentication and database storage.
5. Academic tools: Latin/Greek text comparison, translation alignment, quotation search, bibliographic metadata, and exportable research notes.

## Run locally

This first version is static. Open `index.html` in a browser, or serve the repository with any static web server.

## Deployment

The frontend can be published with GitHub Pages. AI functionality requires a separate backend deployment and server-side secrets configuration. Never put API keys in frontend JavaScript or commit them to this repository.
