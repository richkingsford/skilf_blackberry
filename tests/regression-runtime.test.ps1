$ErrorActionPreference = 'Stop'

$root = 'C:/dev/skilf'
$ensureScriptPath = Join-Path $root 'tests/ensure-regression-gallery-server.ps1'
$runRegressionPath = Join-Path $root 'tests/run-regression.ps1'
$captureScriptPath = Join-Path $root 'tests/capture-regression-screenshot.js'
$playwrightConfigPath = Join-Path $root 'playwright.config.js'
$publishScriptPath = Join-Path $root 'tests/publish-latest-regression-gallery.ps1'
$packageJsonPath = Join-Path $root 'package.json'

$ensureScript = Get-Content $ensureScriptPath -Raw
$runRegression = Get-Content $runRegressionPath -Raw
$captureScript = Get-Content $captureScriptPath -Raw
$playwrightConfig = Get-Content $playwrightConfigPath -Raw
$publishScript = Get-Content $publishScriptPath -Raw
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json

if ($ensureScript -match 'python\s+-m\s+http\.server') {
  throw 'Expected regression server helper to avoid python http.server dependency.'
}

if ($ensureScript -notmatch "npx\.cmd") {
  throw 'Expected regression server helper to use npx.cmd for Node-based serving.'
}

if ($runRegression -notmatch "ensure-regression-gallery-server\.ps1") {
  throw 'Expected run-regression to bootstrap the shared Node server helper.'
}

if ($runRegression -notmatch "ProbePath 'index\.html'") {
  throw 'Expected run-regression to verify the app path through the shared server helper.'
}

if ($runRegression -notmatch '<iframe src="\$\(HtmlEncode "\$AppBaseUrl/index\.html"\)"') {
  throw 'Expected title page preview iframe to load from the shared served app URL.'
}

if ($runRegression -notmatch "capture-regression-screenshot\.js") {
  throw 'Expected run-regression screenshot capture to be routed through the Playwright helper script.'
}

if ($runRegression -match '--headless=new') {
  throw 'Did not expect direct Edge/Chrome headless screenshot arguments in run-regression.'
}

if ($captureScript -notmatch "@playwright/test") {
  throw 'Expected screenshot helper to use Playwright runtime.'
}

if ($runRegression -notmatch 'captured = \$captured') {
  throw 'Expected run-regression to record screenshot capture status per artifact.'
}

if ($publishScript -notmatch 'Screenshot unavailable:') {
  throw 'Expected gallery publisher to surface screenshot capture failures.'
}

if ($playwrightConfig -notmatch "command:\s*'npm run serve:workspace'") {
  throw 'Expected Playwright webServer to use the shared npm workspace serve command.'
}

if ([string]$packageJson.scripts.'serve:workspace' -ne 'serve . -l 3999 --no-clipboard') {
  throw 'Expected package.json script serve:workspace to match the shared server command.'
}

Write-Output 'PASS: regression runtime uses one Node serve path for app preview, Playwright, and gallery publishing.'
