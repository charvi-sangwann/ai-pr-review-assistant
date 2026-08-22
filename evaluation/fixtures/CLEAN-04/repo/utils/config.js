const PORT = 3000;

function connect() {
  return createConnection(PORT);
}

function startServer() {
  return createServer(PORT);
}
