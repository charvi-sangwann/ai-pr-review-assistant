router.get("/users", async (req, res) => {
  const users = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [req.query.id]
  );

  res.json(users);
});
