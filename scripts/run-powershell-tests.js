const { spawnSync } = require("child_process");

const isWindows = process.platform === "win32";
const candidates = isWindows ? ["powershell.exe", "pwsh.exe"] : ["pwsh", "powershell"];
const testFiles = [
  "tests/title-page.test.ps1",
  "tests/experts.test.ps1",
  "tests/regression-runtime.test.ps1",
];

function run(command, args) {
  return spawnSync(command, args, { stdio: "inherit", shell: false });
}

let shell = null;
for (const candidate of candidates) {
  const result = run(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]);
  if (!result.error && result.status === 0) {
    shell = candidate;
    break;
  }
}

if (!shell) {
  console.error(`Unable to find PowerShell. Tried: ${candidates.join(", ")}`);
  process.exit(1);
}

for (const file of testFiles) {
  const result = run(shell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file]);
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
