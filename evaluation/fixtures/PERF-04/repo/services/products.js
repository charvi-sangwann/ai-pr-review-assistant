async function getProducts(db) {
  return db.query("SELECT * FROM products");
}
