const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function candidateJavaBins() {
  const bins = [];
  if (process.env.JAVA_HOME) {
    bins.push(path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java"));
  }
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home && process.platform === "win32") {
    const cacheRoot = path.join(home, ".cache", "skilf-jdk");
    if (fs.existsSync(cacheRoot)) {
      const stack = [cacheRoot];
      while (stack.length) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const fullPath = path.join(current, entry.name);
          if (entry.isDirectory()) stack.push(fullPath);
          if (entry.isFile() && entry.name.toLowerCase() === "java.exe" && path.basename(path.dirname(fullPath)).toLowerCase() === "bin") {
            bins.push(fullPath);
          }
        }
      }
    }
  }
  if (process.platform === "win32") {
    bins.push(
      "C:\\Program Files\\Shutter Encoder\\JRE\\bin\\java.exe",
      "C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe",
      "C:\\Program Files\\Microsoft\\jdk-21.0.0\\bin\\java.exe",
      "C:\\Program Files\\Java\\jdk-21\\bin\\java.exe",
    );
  }
  bins.push("java");
  return bins;
}

function javaBin() {
  for (const candidate of candidateJavaBins()) {
    const exists = candidate === "java" || fs.existsSync(candidate);
    if (!exists) continue;
    const result = spawnSync(candidate, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) continue;
    const modules = spawnSync(candidate, ["--list-modules"], { encoding: "utf8" });
    if (modules.status === 0 && modules.stdout.includes("jdk.httpserver")) return candidate;
  }
  return "";
}

function pathWithJava(bin) {
  if (!bin || bin === "java") return process.env.PATH;
  const dir = path.dirname(bin);
  return `${dir}${path.delimiter}${process.env.PATH || ""}`;
}

const bin = javaBin();
if (!bin) {
  const message = "Firestore rules tests require a full Java runtime with the jdk.httpserver module for the Firebase emulator.";
  if (process.env.CI) {
    console.error(message);
    process.exit(1);
  }
  console.log(`SKIP     ${message} Install Java or run in CI to enforce rules tests.`);
  process.exit(0);
}

const firebaseBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
const command = process.platform === "win32"
  ? `"${firebaseBin}" emulators:exec --project skilf-9f736 --only firestore "node tests/firestore-rules.test.js"`
  : `"${firebaseBin}" emulators:exec --project skilf-9f736 --only firestore "node tests/firestore-rules.test.js"`;
const result = spawnSync(command, {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    DEBUG: "",
    PATH: pathWithJava(bin),
  },
});

if (result.error) console.error(result.error.message || result.error);
process.exit(result.status === null ? 1 : result.status);
