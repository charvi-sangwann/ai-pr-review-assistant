router.get("/admin/users", async (req, res) => {
  const users = await getAllUsers();
  res.json(users);
});
