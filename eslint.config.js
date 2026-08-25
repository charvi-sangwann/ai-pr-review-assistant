const globals = require("globals");

module.exports = [
  {
    files: ["**/*.js"],
    ignores: [
      "node_modules/**",
      "evaluation/fixtures/**",
      "test-data/**"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];
