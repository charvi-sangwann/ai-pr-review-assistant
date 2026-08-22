async function fetchRemote(url) {
  const response = await fetch(url);
  return response.text();
}

module.exports = { fetchRemote };
