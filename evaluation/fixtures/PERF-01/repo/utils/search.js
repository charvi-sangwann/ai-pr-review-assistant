function findMatches(items, targets) {
  const matches = [];

  for (const item of items) {
    for (const target of targets) {
      if (item === target) {
        matches.push(item);
      }
    }
  }

  return matches;
}

module.exports = { findMatches };
