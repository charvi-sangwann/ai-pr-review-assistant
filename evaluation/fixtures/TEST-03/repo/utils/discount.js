function discount(price, percentage) {
  if (percentage > 1) {
    return price;
  }

  return price * (1 - percentage);
}

module.exports = { discount };
