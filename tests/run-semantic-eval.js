#!/usr/bin/env node
"use strict";

// Controlled semantic-evidence benchmark. This evaluates the verifier model
// against labelled synthetic cases; it does not prove formal entailment or
// replace an end-to-end deployment test of /api/chat.

const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(__dirname, "semantic-evidence-cases.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const validExpected = new Set(["supported", "unsupported"]);
const errors = [];

if (!fixture.notice || !fixture.notice.includes("fictional")) errors.push("Fixture must carry its synthetic-source notice.");
if (!fixture.source || !fixture.source.text || !fixture.source.marker) errors.push("Missing source text or marker.");
if (!Array.isArray(fixture.cases) || fixture.cases.length < 5) errors.push("Expected at least five benchmark cases.");
const ids = new Set();
for (const item of fixture.cases || []) {
  if (!item.id || ids.has(item.id)) errors.push("Missing or duplicate case id: " + item.id);
  ids.add(item.id);
  if (!item.claim || !validExpected.has(item.expected) || !item.category) errors.push("Malformed case: " + item.id);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Fixture check passed: " + fixture.cases.length + " cases.");
console.log("Categories: " + [...new Set(fixture.cases.map(x => x.category))].join(", "));
if (process.argv.includes("--check")) process.exit(0);

if (!process.env.GEMINI_API_KEY) {
  console.error("Set GEMINI_API_KEY in your local environment to run the live semantic benchmark. Never commit the key.");
  process.exit(2);
}

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    evaluations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          case_id: { type: "string" },
          verdict: { type: "string", enum: ["supported", "unsupported"] },
          reason: { type: "string" }
        },
        required: ["case_id", "verdict", "reason"]
      }
    }
  },
  required: ["evaluations"]
};

const instructions = [
  "You are an independent semantic evidence auditor for an academic source-bound research system.",
  "Use only the supplied source. Do not use pretrained knowledge, general knowledge, memory, or assumptions.",
  "A claim is supported only if the source directly entails every substantive part of it.",
  "For compound claims, every material component must be supported. If one component is absent, the whole claim is unsupported.",
  "If the source explicitly states the opposite, the claim is unsupported.",
  "Topical similarity is not evidence. A claim unrelated to the source is unsupported.",
  "Historical plausibility is irrelevant: a date, ruler, event, cause, or context not stated or entailed by the source is unsupported, even if it sounds plausible.",
  "Do not infer that an absent claim is historically false; assess only whether this source supports it.",
  "When uncertain, choose unsupported. Return one verdict for every case ID."
].join("\n");

async function main() {
  const model = process.env.GEMINI_VERIFIER_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const payload = {
    source: fixture.source,
    cases: fixture.cases.map(({ id, category, claim }) => ({ id, category, claim }))
  };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(process.env.GEMINI_API_KEY), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0,
        maxOutputTokens: 1600
      }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Gemini API request failed.");
  const candidate = data?.candidates?.[0];
  const outputText = (candidate?.content?.parts || []).map(part => part.text || "").join("");
  if (!outputText || candidate?.finishReason === "MAX_TOKENS") throw new Error("Gemini returned no complete structured output.");

  const result = JSON.parse(outputText);
  if (!Array.isArray(result.evaluations)) throw new Error("Malformed evaluation output.");
  const byId = new Map();
  for (const row of result.evaluations) {
    if (!row || typeof row.case_id !== "string" || !validExpected.has(row.verdict)) continue;
    if (byId.has(row.case_id)) byId.set(row.case_id, "DUPLICATE");
    else byId.set(row.case_id, row);
  }

  let correct = 0;
  const rows = fixture.cases.map(test => {
    const actual = byId.get(test.id);
    const verdict = actual && actual !== "DUPLICATE" ? actual.verdict : "MISSING_OR_DUPLICATE";
    const pass = verdict === test.expected;
    if (pass) correct++;
    return { id: test.id, category: test.category, expected: test.expected, actual: verdict, pass, reason: actual && actual.reason ? actual.reason : "" };
  });

  console.log("\nPACIANA semantic evidence benchmark");
  console.log("Model: " + model);
  console.table(rows);
  const accuracy = Math.round((correct / fixture.cases.length) * 100);
  console.log("Score: " + correct + "/" + fixture.cases.length + " (" + accuracy + "%)");
  if (correct !== fixture.cases.length) process.exitCode = 1;
}

main().catch(error => {
  console.error("Benchmark failed: " + error.message);
  process.exit(1);
});
