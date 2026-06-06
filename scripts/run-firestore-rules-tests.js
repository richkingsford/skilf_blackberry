const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
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

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

function randomFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.listen(0, "127.0.0.1");
  });
}

async function firestoreEmulatorPort() {
  if (process.env.FIRESTORE_EMULATOR_PORT) return Number(process.env.FIRESTORE_EMULATOR_PORT);
  for (const port of [8080, 18080, 18081, 18082, 18083]) {
    if (await canListen(port)) return port;
  }
  return randomFreePort();
}

async function main() {
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

  const port = await firestoreEmulatorPort();
  const configPath = path.join(os.tmpdir(), `skilf-firebase-emulator-${process.pid}.json`);
  fs.writeFileSync(configPath, JSON.stringify({
    firestore: {
      rules: path.join(root, "firestore.rules"),
      indexes: path.join(root, "firestore.indexes.json"),
    },
    emulators: {
      firestore: {
        host: "127.0.0.1",
        port,
      },
    },
  }, null, 2));

  const firebaseBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "firebase.cmd" : "firebase");
  const command = process.platform === "win32"
    ? `"${firebaseBin}" emulators:exec --config "${configPath}" --project skilf-9f736 --only firestore "node tests/firestore-rules.test.js"`
    : `"${firebaseBin}" emulators:exec --config "${configPath}" --project skilf-9f736 --only firestore "node tests/firestore-rules.test.js"`;
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

  fs.rmSync(configPath, { force: true });

  if (result.error) console.error(result.error.message || result.error);
  process.exit(result.status === null ? 1 : result.status);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
