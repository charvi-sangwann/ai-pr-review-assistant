const { query } = require("../db");

/**
 * Look up a user by their API token. Always goes through the parameterized
 * `query()` helper in db.js — never build raw SQL strings by hand.
 */
async function findUserByToken(token) {
  const result = await query("SELECT * FROM users WHERE api_token = $1", [token]);
  return result.rows[0] || null;
}

function requireAuth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) {
    return res.status(401).json({ error: "Missing auth token" });
  }
  findUserByToken(token)
    .then((user) => {
      if (!user) return res.status(401).json({ error: "Invalid token" });
      req.user = user;
      next();
    })
    .catch(next);
}

module.exports = { findUserByToken, requireAuth };
