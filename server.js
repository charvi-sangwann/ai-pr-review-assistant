require("dotenv").config();
const express = require("express");
const reviewRoute = require("./routes/review");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api", reviewRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI PR Review Assistant (local mode) listening on http://localhost:${PORT}`);
  console.log(`Try: POST http://localhost:${PORT}/api/review`);
});
