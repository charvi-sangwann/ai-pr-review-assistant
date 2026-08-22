router.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  fs.writeFileSync("/uploads/" + file.originalname, file.buffer);
  res.json({ uploaded: true });
});
