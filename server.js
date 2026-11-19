const express = require("express");
const path = require("path");
const chatHandler = require("./api/chat");

const app = express();
const PORT = Number(process.env.PORT) || 10000;

app.disable("x-powered-by");
app.use(express.json({ limit: "16mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, app: "PACIANA Research Notebook" });
});

app.post("/api/chat", (req, res) => chatHandler(req, res));

app.use(express.static(path.join(__dirname)));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("PACIANA listening on port " + PORT);
});
