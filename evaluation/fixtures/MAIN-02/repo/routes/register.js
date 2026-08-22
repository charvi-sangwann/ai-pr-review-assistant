router.post("/register", async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({ error: "Email required" });
  }

  const existing = await db.findUser(req.body.email);

  if (existing) {
    return res.status(409).json({ error: "Already exists" });
  }

  const user = await db.createUser(req.body);
  await sendWelcomeEmail(user);

  res.status(201).json(user);
});
