const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "fixtures");

const cases = {
  "SEC-01": {
    file: "routes/users.js",
    before: `
const express = require("express");
const router = express.Router();

router.get("/users/:id", async (req, res) => {
  const user = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [req.params.id]
  );
  res.json(user);
});

module.exports = router;
`,
    after: `
const express = require("express");
const router = express.Router();

router.get("/users/:id", async (req, res) => {
  const user = await db.query(
    "SELECT * FROM users WHERE id = " + req.params.id
  );
  res.json(user);
});

module.exports = router;
`
  },

  "SEC-02": {
    file: "utils/command.js",
    before: `
const { exec } = require("child_process");

function runCommand(input, callback) {
  exec("ls", (error, stdout, stderr) => {
    callback(error, stdout, stderr);
  });
}

module.exports = { runCommand };
`,
    after: `
const { exec } = require("child_process");

function runCommand(input, callback) {
  exec("ls " + input, (error, stdout, stderr) => {
    callback(error, stdout, stderr);
  });
}

module.exports = { runCommand };
`
  },

  "SEC-03": {
    file: "config/api.js",
    before: `
module.exports = {
  baseUrl: process.env.API_URL
};
`,
    after: `
module.exports = {
  baseUrl: process.env.API_URL,
  apiKey: "sk_live_123456789abcdef"
};
`
  },

"SEC-04": {
  file: "utils/files.js",
  before: `
const fs = require("fs");

function readFile(name) {
  const safeName = name.replace(/\\.\\./g, "");
  return fs.readFileSync("/app/uploads/" + safeName, "utf8");
}

module.exports = { readFile };
`,
  after: `
const fs = require("fs");

function readFile(name) {
  return fs.readFileSync("/app/uploads/" + name, "utf8");
}

module.exports = { readFile };
`
},
  "SEC-05": {
    file: "routes/profile.js",
    before: `
router.get("/profile", (req, res) => {
  res.send("<h1>Profile</h1>");
});
`,
    after: `
router.get("/profile", (req, res) => {
  const name = req.query.name;
  res.send("<h1>Hello " + name + "</h1>");
});
`
  },

"SEC-06": {
  file: "routes/admin.js",
  before: `
router.get("/admin/users", requireAdmin, async (req, res) => {
  const users = await getAllUsers();
  res.json(users);
});
`,
  after: `
router.get("/admin/users", async (req, res) => {
  const users = await getAllUsers();
  res.json(users);
});
`
},

  "SEC-07": {
    file: "auth/password.js",
    before: `
const bcrypt = require("bcrypt");

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

module.exports = { hashPassword };
`,
    after: `
const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("md5").update(password).digest("hex");
}

module.exports = { hashPassword };
`
  },

  "SEC-08": {
    file: "services/fetchUrl.js",
    before: `
async function fetchRemote(url) {
  const response = await fetch("https://example.com");
  return response.text();
}

module.exports = { fetchRemote };
`,
    after: `
async function fetchRemote(url) {
  const response = await fetch(url);
  return response.text();
}

module.exports = { fetchRemote };
`
  },

  "SEC-09": {
    file: "routes/login.js",
    before: `
router.post("/login", (req, res) => {
  console.log("Login attempt");
  res.json({ success: true });
});
`,
    after: `
router.post("/login", (req, res) => {
  console.log("Login attempt", req.body.username, req.body.password);
  res.json({ success: true });
});
`
  },

  "SEC-10": {
    file: "routes/upload.js",
    before: `
router.post("/upload", upload.single("file"), (req, res) => {
  res.json({ uploaded: true });
});
`,
    after: `
router.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file;
  fs.writeFileSync("/uploads/" + file.originalname, file.buffer);
  res.json({ uploaded: true });
});
`
  },

  "COR-01": {
    file: "utils/sum.js",
    before: `
function sum(values) {
  let total = 0;

  for (let i = 0; i < values.length; i++) {
    total += values[i];
  }

  return total;
}

module.exports = { sum };
`,
    after: `
function sum(values) {
  let total = 0;

  for (let i = 0; i <= values.length; i++) {
    total += values[i];
  }

  return total;
}

module.exports = { sum };
`
  },

  "COR-02": {
    file: "services/process.js",
    before: `
function processUsers(users) {
  for (const user of users) {
    saveUser(user);
  }
}
`,
    after: `
function processUsers(users) {
  for (const user of users) {
    saveUser(user);
    return true;
  }
}
`
  },

  "COR-03": {
    file: "auth/check.js",
    before: `
function isAdmin(role) {
  return role === "admin";
}

module.exports = { isAdmin };
`,
    after: `
function isAdmin(role) {
  return role = "admin";
}

module.exports = { isAdmin };
`
  },

  "COR-04": {
    file: "math/divide.js",
    before: `
function divide(a, b) {
  if (b === 0) {
    return null;
  }

  return a / b;
}

module.exports = { divide };
`,
    after: `
function divide(a, b) {
  return a / b;
}

module.exports = { divide };
`
  },

  "COR-05": {
    file: "services/user.js",
    before: `
async function getUser(id) {
  return await db.findUser(id);
}
`,
    after: `
async function getUser(id) {
  return db.findUser(id);
}
`
  },

  "COR-06": {
    file: "routes/createUser.js",
    before: `
router.post("/users", async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
`,
    after: `
router.post("/users", async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json(user);
  } catch (error) {
    console.error(error);
  }

  res.status(201).json({ success: true });
});
`
  },

  "PERF-01": {
    file: "utils/search.js",
    before: `
function findMatches(items, targets) {
  return items.filter(item => targets.includes(item));
}

module.exports = { findMatches };
`,
    after: `
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
`
  },

  "PERF-02": {
    file: "services/users.js",
    before: `
async function loadUsers(ids) {
  return db.query("SELECT * FROM users");
}
`,
    after: `
async function loadUsers(ids) {
  const users = [];

  for (const id of ids) {
    const user = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    users.push(user);
  }

  return users;
}
`
  },

  "PERF-03": {
    file: "utils/report.js",
    before: `
function createReport(items) {
  const total = calculateTotal(items);
  return { total };
}
`,
    after: `
function createReport(items) {
  let total = 0;

  for (const item of items) {
    total += calculateTotal(items);
  }

  return { total };
}
`
  },

  "PERF-04": {
    file: "services/products.js",
    before: `
async function getProducts(db) {
  return db.query("SELECT id, name FROM products LIMIT 100");
}
`,
    after: `
async function getProducts(db) {
  return db.query("SELECT * FROM products");
}
`
  },

  "MAIN-01": {
    file: "services/orders.js",
    before: `
function createOrder(order) {
  return saveOrder(order);
}
`,
    after: `
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
`
  },

  "MAIN-02": {
    file: "routes/register.js",
    before: `
router.post("/register", async (req, res) => {
  const user = await registerUser(req.body);
  res.json(user);
});
`,
    after: `
router.post("/register", async (req, res) => {
  if (!req.body.email) {
    return res.status(400).json({ error: "Email required" });
  }

  const existing = await db.findUser(req.body.email);

  if (existing) {
    return res.status(409).json({ error: "Already exists" });
  }

  const user = await db.createUser(req.body);
  await sendWelcomeEmail(user);

  res.status(201).json(user);
});
`
  },

  "MAIN-03": {
    file: "utils/user.js",
    before: `
function getUserName(user) {
  return user.name;
}
`,
    after: `
function g(u) {
  return u.n;
}
`
  },

  "TEST-01": {
    file: "routes/products.js",
    before: `
router.get("/products", async (req, res) => {
  const products = await getProducts();
  res.json(products);
});
`,
    after: `
router.get("/products", async (req, res) => {
  const products = await getProducts();
  res.json(products);
});

router.post("/products", async (req, res) => {
  const product = await createProduct(req.body);
  res.status(201).json(product);
});
`
  },

  "TEST-02": {
    file: "auth/login.js",
    before: `
async function login(username, password) {
  return authenticate(username, password);
}
`,
    after: `
async function login(username, password) {
  const user = await authenticate(username, password);

  if (!user) {
    throw new Error("Invalid credentials");
  }

  return user;
}
`
  },

  "TEST-03": {
    file: "utils/discount.js",
    before: `
function discount(price, percentage) {
  return price * (1 - percentage);
}

module.exports = { discount };
`,
    after: `
function discount(price, percentage) {
  if (percentage > 1) {
    return price;
  }

  return price * (1 - percentage);
}

module.exports = { discount };
`
  },

  "CLEAN-01": {
    file: "utils/user.js",
    before: `
function getName(user) {
  const name = user.name;
  return name;
}
`,
    after: `
function getName(user) {
  const username = user.name;
  return username;
}
`
  },

  "CLEAN-02": {
    file: "routes/users.js",
    before: `
router.get("/users", async (req, res) => {
  const users = await db.query(
    "SELECT * FROM users WHERE id = " + req.query.id
  );

  res.json(users);
});
`,
    after: `
router.get("/users", async (req, res) => {
  const users = await db.query(
    "SELECT * FROM users WHERE id = $1",
    [req.query.id]
  );

  res.json(users);
});
`
  },

  "CLEAN-03": {
    file: "utils/math.js",
    before: `
function add(a, b) {
  return a + b;
}

module.exports = { add };
`,
    after: `
function add(a, b) {
  return a + b;
}

module.exports = { add };
`
  },

  "CLEAN-04": {
    file: "utils/config.js",
    before: `
function connect() {
  return createConnection(3000);
}

function startServer() {
  return createServer(3000);
}
`,
    after: `
const PORT = 3000;

function connect() {
  return createConnection(PORT);
}

function startServer() {
  return createServer(PORT);
}
`
  }
};

function normalize(text) {
  return text.trim() + "\n";
}

function createDiff(file, before, after) {
  const oldLines = normalize(before).trimEnd().split("\n");
  const newLines = normalize(after).trimEnd().split("\n");

  const n = oldLines.length;
  const m = newLines.length;

  // Build LCS table
  const dp = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Build diff operations
  const operations = [];

  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      operations.push({
        type: "context",
        line: oldLines[i]
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      operations.push({
        type: "remove",
        line: oldLines[i]
      });
      i++;
    } else {
      operations.push({
        type: "add",
        line: newLines[j]
      });
      j++;
    }
  }

  while (i < n) {
    operations.push({
      type: "remove",
      line: oldLines[i]
    });
    i++;
  }

  while (j < m) {
    operations.push({
      type: "add",
      line: newLines[j]
    });
    j++;
  }

  // Find first and last actual change
  let firstChange = operations.findIndex(
    op => op.type !== "context"
  );

  if (firstChange === -1) {
    return [
      `diff --git a/${file} b/${file}`,
      `index 1111111..2222222 100644`,
      `--- a/${file}`,
      `+++ b/${file}`,
      `@@ -1,${n} +1,${m} @@`,
      ...oldLines.map(line => ` ${line}`)
    ].join("\n") + "\n";
  }

  let lastChange = operations.length - 1;

  while (
    lastChange >= 0 &&
    operations[lastChange].type === "context"
  ) {
    lastChange--;
  }

  // Keep up to 3 lines of context around the change
  const contextBefore = 3;
  const contextAfter = 3;

  const start = Math.max(0, firstChange - contextBefore);
  const end = Math.min(
    operations.length - 1,
    lastChange + contextAfter
  );

  const selected = operations.slice(start, end + 1);

  // Calculate old/new line ranges
  let oldStart = 1;
  let newStart = 1;

  for (let k = 0; k < start; k++) {
    if (operations[k].type !== "add") {
      oldStart++;
    }

    if (operations[k].type !== "remove") {
      newStart++;
    }
  }

  const oldCount = selected.filter(
    op => op.type !== "add"
  ).length;

  const newCount = selected.filter(
    op => op.type !== "remove"
  ).length;

  const diff = [
    `diff --git a/${file} b/${file}`,
    `index 1111111..2222222 100644`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`
  ];

  for (const op of selected) {
    if (op.type === "context") {
      diff.push(` ${op.line}`);
    } else if (op.type === "remove") {
      diff.push(`-${op.line}`);
    } else if (op.type === "add") {
      diff.push(`+${op.line}`);
    }
  }

  return diff.join("\n") + "\n";
}
for (const [id, testCase] of Object.entries(cases)) {
  const fixtureDir = path.join(BASE, id);
  const repoFile = path.join(fixtureDir, "repo", testCase.file);
  const diffFile = path.join(fixtureDir, "change.diff");

  fs.mkdirSync(path.dirname(repoFile), { recursive: true });

  fs.writeFileSync(repoFile, normalize(testCase.after));
  fs.writeFileSync(
    diffFile,
    createDiff(testCase.file, testCase.before, testCase.after)
  );

  console.log(`Created ${id}`);
}

console.log(`\nCreated ${Object.keys(cases).length} evaluation fixtures.`);