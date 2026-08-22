router.post("/users", async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    console.error(error);
  }

  res.status(201).json({ success: true });
});
