# PACIANA semantic evidence benchmark

This folder contains a small, labelled benchmark for checking whether the semantic evidence auditor distinguishes textual support from mere plausibility.

## Important scope

The benchmark source is deliberately fictional and is labelled as such. It is a software test fixture, not a patristic text, historical testimony, or citable scholarly source. Do not import it into research notebooks as evidence.

## Cases

| Case | Category | Expected verdict | What it tests |
|---|---|---|---|
| SUPPORTED-01 | Fully supported | supported | Direct statement in the source |
| PARTIAL-01 | Partially supported | unsupported | A compound claim with one unsupported addition |
| CONTRADICTED-01 | Contradicted | unsupported | Source states a different duration |
| UNRELATED-01 | Unrelated | unsupported | No evidentiary relationship |
| PLAUSIBLE-ABSENT-01 | Historically plausible but absent | unsupported | Plausible date and ruler are not in the source |

The expected verdict for a partially supported compound claim is **unsupported** because every material part of a claim must be evidenced. A future improvement may split compound claims into atomic propositions before evaluation.

## Run

Check fixture structure without making an API request:

```bash
node tests/run-semantic-eval.js --check
```

Run the live model benchmark:

```bash
GEMINI_API_KEY=... node tests/run-semantic-eval.js
```

On Windows PowerShell:

```powershell
$env:GEMINI_API_KEY="..."
node tests/run-semantic-eval.js
```

Optionally set `GEMINI_VERIFIER_MODEL`; otherwise the script uses `GEMINI_MODEL` or `gemini-2.5-flash-lite`. Keep the API key in the local environment; never commit it to GitHub or paste it into chat.

## Interpretation

A passing result means the model gave the expected labels for these five controlled examples in that run. It does **not** establish general reliability, formal logical entailment, or correct interpretation of historical sources. Model outputs may vary. Run the benchmark repeatedly and expand it with authentic, edition-checked passages and expert-labelled claims before drawing conclusions about academic performance.

This is a model-level benchmark of the semantic audit prompt. It does not call the deployed `/api/chat` endpoint and therefore is not an end-to-end test of retrieval, quotation matching, UI rendering, or citation display.
