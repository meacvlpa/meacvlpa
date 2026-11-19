const MAX_BODY_CHARS = 120000;
const MAX_SOURCES = 20;
const MAX_CHUNKS = 80;
const MAX_REQUESTS_PER_MINUTE = 12;
const requestCounts = new Map();

function send(res, status, payload) {
  res.status(status).json(payload);
}

function rateLimited(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown").split(",")[0].trim();
  const now = Date.now();
  const entry = requestCounts.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60000) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count += 1;
  requestCounts.set(ip, entry);
  return entry.count > MAX_REQUESTS_PER_MINUTE;
}

function terms(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t => !STOP.has(t));
}
const STOP = new Set(["the","and","for","with","that","this","from","into","your","what","when","where","which","have","has","are","was","were","about","their","them","they","you","les","des","une","dans","pour","avec","que","qui","del","della","delle","degli","che","per","con","una","nel","dalla","dalle","dello","delle","dell","delle","dan","yang","untuk","dari","pada","dengan","adalah","atau","ini","itu","dalam","oleh","para"]);

function rankChunks(question, sources) {
  const queryTerms = [...new Set(terms(question))];
  const chunks = [];
  for (const source of sources) {
    if (!source || typeof source.name !== "string" || !Array.isArray(source.chunks)) continue;
    for (const chunk of source.chunks) {
      if (!chunk || typeof chunk.text !== "string") continue;
      const text = chunk.text.slice(0, 5000);
      const contentTerms = terms(text);
      const counts = new Map();
      for (const t of contentTerms) counts.set(t, (counts.get(t) || 0) + 1);
      let score = 0;
      for (const term of queryTerms) score += Math.min(counts.get(term) || 0, 4);
      if (score > 0) chunks.push({ name: source.name.slice(0,180), page: Number.isInteger(chunk.page) ? chunk.page : null, text, score });
    }
  }
  return chunks.sort((a,b)=>b.score-a.score).slice(0,10);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed. Use POST." });
  }
  if (rateLimited(req)) return send(res, 429, { error: "Too many requests. Please wait a minute and try again." });

  try {
    const body = req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const sources = Array.isArray(body.sources) ? body.sources.slice(0, MAX_SOURCES) : [];
    if (!question || question.length > 4000) return send(res, 400, { error: "Please provide a question (maximum 4,000 characters)." });
    if (!sources.length) return send(res, 400, { error: "Add at least one readable source before asking a question." });

    let totalChars = 0;
    let totalChunks = 0;
    for (const source of sources) {
      if (!source || !Array.isArray(source.chunks)) continue;
      for (const chunk of source.chunks) {
        if (chunk && typeof chunk.text === "string") {
          totalChars += chunk.text.length;
          totalChunks += 1;
        }
      }
    }
    if (totalChars > MAX_BODY_CHARS || totalChunks > MAX_CHUNKS) {
      return send(res, 413, { error: "Your source selection is too large for one question. Use fewer or shorter documents." });
    }

    const relevant = rankChunks(question, sources);
    if (!relevant.length) {
      return send(res, 200, { answer: "I could not find passages that clearly match your question in the extracted text of the sources provided. Try different terms or add a more relevant source.", citations: [], grounded: false });
    }
    if (!process.env.OPENAI_API_KEY) return send(res, 503, { error: "The backend is ready, but OPENAI_API_KEY has not been configured in Vercel yet." });

    const sourceContext = relevant.map((item, index) => {
      const page = item.page === null ? "page not available" : "page " + item.page;
      return "[S" + (index+1) + "] Source: " + item.name + " (" + page + ")\n" + item.text;
    }).join("\n\n---\n\n");

    const instructions = [
      "You are PACIANA, a rigorous research assistant for Patristics, Church history, and theology.",
      "Answer the user's question using ONLY the supplied source excerpts. Do not use outside knowledge to fill gaps.",
      "Cite every substantive claim with the exact source marker [S1], [S2], etc. supplied in the excerpts.",
      "Never invent quotations, page numbers, titles, authors, editions, or bibliographic details.",
      "If the excerpts do not establish a claim, say so explicitly. Distinguish direct evidence from your interpretation.",
      "When discussing Latin or Greek, preserve original wording exactly when present and do not silently normalize it.",
      "For historical or theological interpretation, identify ambiguity and competing readings rather than overstating certainty.",
      "Answer in the same language as the user's question unless asked otherwise. Use clear academic prose.",
      "End with a short section titled 'Sources used' listing only the source markers actually cited."
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions,
        input: "QUESTION:\n" + question + "\n\nRETRIEVED SOURCE EXCERPTS:\n" + sourceContext,
        max_output_tokens: 1800
      })
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : "The AI provider request failed.";
      return send(res, response.status === 429 ? 429 : 502, { error: message });
    }
    const answer = data.output_text || (data.output || []).flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text).join("\n");
    if (!answer) return send(res, 502, { error: "The AI returned an empty response. Please try again." });

    const citations = relevant.map((item,index)=>({ marker:"S"+(index+1), source:item.name, page:item.page }));
    return send(res, 200, { answer, citations, grounded: true, model: data.model || process.env.OPENAI_MODEL || "gpt-4.1-mini" });
  } catch (error) {
    console.error("PACIANA chat error:", error);
    return send(res, 500, { error: "An unexpected server error occurred. Check the Vercel function logs for details." });
  }
};
