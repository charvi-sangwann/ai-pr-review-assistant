const { exec } = require("child_process");

function runCommand(input, callback) {
  exec("ls " + input, (error, stdout, stderr) => {
    callback(error, stdout, stderr);
  });
}

module.exports = { runCommand };
