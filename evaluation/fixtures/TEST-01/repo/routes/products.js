router.get("/products", async (req, res) => {
  const products = await getProducts();
  res.json(products);
});

router.post("/products", async (req, res) => {
  const product = await createProduct(req.body);
  res.status(201).json(product);
});
