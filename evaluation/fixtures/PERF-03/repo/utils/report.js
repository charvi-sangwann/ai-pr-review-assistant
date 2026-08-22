function createReport(items) {
  let total = 0;

  for (const item of items) {
    total += calculateTotal(items);
  }

  return { total };
}
