const fs = require("fs");

function readFile(name) {
  return fs.readFileSync("/app/uploads/" + name, "utf8");
}

module.exports = { readFile };
