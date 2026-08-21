const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Always use parameterized queries here. Never interpolate user input
 * directly into a SQL string — see utils/auth.js for the pattern.
 */
function query(text, params) {
  return pool.query(text, params);
}

function getUserById(id) {
  return query("SELECT * FROM users WHERE id = $1", [id]);
}

module.exports = { query, getUserById, pool };
