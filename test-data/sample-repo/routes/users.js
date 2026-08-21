const express = require("express");
const router = express.Router();
const { query } = require("../db");
const { requireAuth } = require("../utils/auth");

router.get("/users/:id", requireAuth, async (req, res) => {
  const result = await query("SELECT * FROM users WHERE id = $1", [req.params.id]);
  res.json(result.rows[0] || null);
});

module.exports = router;
