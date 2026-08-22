function createOrder(order) {
  validateOrder(order);
  saveOrder(order);
  sendConfirmation(order);
}

function updateOrder(order) {
  validateOrder(order);
  saveOrder(order);
  sendConfirmation(order);
}
