router.post("/login", (req, res) => {
  console.log("Login attempt", req.body.username, req.body.password);
  res.json({ success: true });
});
