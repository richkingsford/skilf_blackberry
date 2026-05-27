const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const target = path.join(os.tmpdir(), "skilf-netlify-clean-deploy");
const staticExtensions = new Set([".html", ".css", ".js"]);
const excludedRootFiles = new Set(["playwright.config.js"]);
const rootStaticFiles = [
  "experts.json",
  "prospectivePartners.json",
  "skill-tree.json",
  "profile icons.png",
  "profile icons_one_column.png",
];
const staticDirectories = ["assets", "docs"];

function copyFile(source, destinationDirectory) {
  fs.copyFileSync(source, path.join(destinationDirectory, path.basename(source)));
}

function assertInsideTemp(directory) {
  const resolvedTarget = path.resolve(directory);
  const resolvedTemp = path.resolve(os.tmpdir());
  if (!resolvedTarget.startsWith(resolvedTemp)) {
    throw new Error(`Refusing to remove unexpected deploy directory: ${resolvedTarget}`);
  }
}

assertInsideTemp(target);
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (excludedRootFiles.has(entry.name)) continue;
  if (!staticExtensions.has(path.extname(entry.name))) continue;
  copyFile(path.join(root, entry.name), target);
}

for (const file of rootStaticFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) copyFile(source, target);
}

for (const directory of staticDirectories) {
  const source = path.join(root, directory);
  const destination = path.join(target, directory);
  if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true });
}

const netlifyArgs = [
  "netlify",
  "deploy",
  "--prod",
  "--dir",
  target,
  "--functions",
  "netlify/functions",
  "--message",
  "Clean production deploy",
];
const command = process.platform === "win32" ? "cmd.exe" : "npx";
const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npx.cmd", ...netlifyArgs] : netlifyArgs;
const result = spawnSync(command, commandArgs, {
  cwd: root,
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message || result.error);
  process.exitCode = 1;
} else {
  process.exitCode = result.status || 0;
}
