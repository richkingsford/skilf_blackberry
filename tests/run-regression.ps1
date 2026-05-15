param(
  [string]$Root = 'C:/dev/skilf',
  [string]$AppBaseUrl = 'http://127.0.0.1:3999'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function HtmlEncode([string]$Text) {
  return [System.Net.WebUtility]::HtmlEncode($Text)
}

function New-Page([string]$Path, [string]$Title, [string]$Body) {
  $html = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$(HtmlEncode $Title)</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: "Segoe UI", Arial, sans-serif;
      background: #f6f8fb;
      color: #10243e;
    }
    h1, h2 { margin-top: 0; }
    .panel {
      background: #fff;
      border: 1px solid #d5dfef;
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 18px;
      box-shadow: 0 12px 30px rgba(16, 36, 62, 0.06);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-top: 1px solid #d5dfef;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
      font-family: Consolas, monospace;
      line-height: 1.5;
    }
    iframe {
      width: 100%;
      height: 860px;
      border: 1px solid #d5dfef;
      border-radius: 12px;
      background: #fff;
    }
    code { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  $Body
</body>
</html>
"@

  Set-Content -Path $Path -Value $html -Encoding utf8
}

function Invoke-TestScript([string]$TestPath) {
  $command = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $TestPath)
  $output = & powershell.exe @command 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  if ($null -eq $exitCode) {
    $exitCode = 0
  }

  return [pscustomobject]@{
    name = Split-Path $TestPath -Leaf
    command = "powershell.exe $($command -join ' ')"
    output = $output.TrimEnd()
    exit_code = $exitCode
    status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
  }
}

function Invoke-Screenshot([string]$RootPath, [string]$PagePath, [string]$OutputPath) {
  $resolvedPagePath = (Resolve-Path $PagePath).Path
  $scriptPath = Join-Path $RootPath 'tests/capture-regression-screenshot.js'
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand) {
    return 'node is required to run Playwright screenshot capture.'
  }

  $arguments = @(
    $scriptPath,
    $resolvedPagePath,
    $OutputPath
  )

  $output = ''
  $exitCode = 0
  try {
    $output = & $nodeCommand.Source @arguments 2>&1 | Out-String
    $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }
  } catch {
    $output = $_ | Out-String
    $exitCode = if ($null -eq $LASTEXITCODE) { 1 } else { [int]$LASTEXITCODE }
  }

  if ($exitCode -ne 0 -or -not (Test-Path $OutputPath)) {
    $trimmed = $output.Trim()
    if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
      return $trimmed
    }

    return "Screenshot capture failed for $PagePath"
  }

  return $null
}

$rootPath = (Resolve-Path $Root).Path
$artifactRoot = Join-Path $rootPath 'regression-artifacts/tester'
$runsRoot = Join-Path $artifactRoot 'runs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$runDir = Join-Path $runsRoot $timestamp
$screenshotsDir = Join-Path $runDir 'screenshots'
$logPath = Join-Path $runDir 'regression.log'
$currentRunPath = Join-Path $artifactRoot '.current-run.txt'

New-Item -ItemType Directory -Force -Path $runsRoot, $runDir, $screenshotsDir | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $rootPath 'tests/ensure-regression-gallery-server.ps1') `
  -Root $rootPath `
  -Port 3999 `
  -ProbePath 'index.html' | Out-Null

$testsRoot = Join-Path $rootPath 'tests'
$testScripts = Get-ChildItem -Path $testsRoot -Filter '*.test.ps1' | Sort-Object Name
$results = @()

foreach ($testScript in $testScripts) {
  $results += Invoke-TestScript -TestPath $testScript.FullName
}

$status = if (@($results | Where-Object { $_.status -eq 'FAIL' }).Count -gt 0) { 'FAIL' } else { 'PASS' }
$generatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'

$logLines = @("[start] $generatedAt")
foreach ($result in $results) {
  $logLines += "[$($result.status)] $($result.name)"
  $logLines += $result.output
  $logLines += ''
}
$logLines += "[end] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
$logLines += "overall_status=$status"

Set-Content -Path $logPath -Value ($logLines -join "`n") -Encoding utf8

$summaryRows = foreach ($result in $results) {
  "<tr><td>$(HtmlEncode $result.name)</td><td>$(HtmlEncode $result.status)</td><td><code>$(HtmlEncode $result.command)</code></td></tr>"
}

New-Page -Path (Join-Path $runDir '01-overview.html') -Title 'Regression Overview' -Body @"
<div class="panel">
  <h1>Regression Validation Overview</h1>
  <p>Broadest safe automated validation for the current Skilf workspace.</p>
  <p><strong>Run:</strong> <code>$(HtmlEncode $timestamp)</code></p>
  <p><strong>Status:</strong> $(HtmlEncode $status)</p>
</div>
<div class="panel">
  <h2>Executed Tests</h2>
  <table>
    <thead><tr><th>Test</th><th>Status</th><th>Command</th></tr></thead>
    <tbody>
      $($summaryRows -join "`n")
    </tbody>
  </table>
</div>
"@

$indexPath = Join-Path $rootPath 'index.html'
if (Test-Path $indexPath) {
  New-Page -Path (Join-Path $runDir '02-title-page-preview.html') -Title 'Title Page Preview' -Body @"
<div class="panel">
  <h1>Skilf Title Page</h1>
  <p>Live preview of the current app landing page.</p>
</div>
<iframe src="$(HtmlEncode "$AppBaseUrl/index.html")" title="Skilf title page"></iframe>
"@
}

$expertsPath = Join-Path $rootPath 'experts.json'
if (Test-Path $expertsPath) {
  $expertsJson = Get-Content $expertsPath -Raw | ConvertFrom-Json
  $expertRows = foreach ($expert in $expertsJson) {
    $headline = if ($expert.skill) { [string]$expert.skill } else { [string]$expert.field }
    "<tr><td>$(HtmlEncode $expert.name)</td><td>$(HtmlEncode $headline)</td><td>$(HtmlEncode $expert.region)</td></tr>"
  }
  $prettyExpertsJson = $expertsJson | ConvertTo-Json -Depth 5
  New-Page -Path (Join-Path $runDir '03-experts-json-preview.html') -Title 'Experts JSON Preview' -Body @"
<div class="panel">
  <h1>Experts Data Preview</h1>
  <p>Rendered view of the current <code>experts.json</code> payload.</p>
  <table>
    <thead><tr><th>Name</th><th>Field</th><th>Region</th></tr></thead>
    <tbody>
      $($expertRows -join "`n")
    </tbody>
  </table>
</div>
<div class="panel">
  <h2>Raw JSON</h2>
  <pre>$(HtmlEncode $prettyExpertsJson)</pre>
</div>
"@
}

$backlogPath = Join-Path $rootPath 'backlog_needsTesting.txt'
if (Test-Path $backlogPath) {
  $backlogText = Get-Content $backlogPath -Raw
  New-Page -Path (Join-Path $runDir '04-backlog-needsTesting-preview.html') -Title 'Backlog Queue Preview' -Body @"
<div class="panel">
  <h1>Needs-Testing Queue</h1>
  <p>Current validation queue at the time of the run.</p>
</div>
<div class="panel">
  <pre>$(HtmlEncode $backlogText)</pre>
</div>
"@
}

$resultPanels = foreach ($result in $results) {
@"
<div class="panel">
  <h2>$(HtmlEncode $result.name) - $(HtmlEncode $result.status)</h2>
  <p><code>$(HtmlEncode $result.command)</code></p>
  <pre>$(HtmlEncode $result.output)</pre>
</div>
"@
}
New-Page -Path (Join-Path $runDir '05-test-results.html') -Title 'Test Result Output' -Body @"
<h1>Regression Test Output</h1>
$($resultPanels -join "`n")
"@

$shotDefinitions = @(
  @{ title = 'App title page'; source = '02-title-page-preview.html'; image = '01-title-page.png'; description = 'Visual proof of the current Skilf landing page.' },
  @{ title = 'Experts data'; source = '03-experts-json-preview.html'; image = '02-experts-data.png'; description = 'Rendered experts payload and regional diversity evidence.' },
  @{ title = 'Needs-testing queue'; source = '04-backlog-needsTesting-preview.html'; image = '03-needs-testing-queue.png'; description = 'Active validation queue at the moment the regression ran.' },
  @{ title = 'Regression overview'; source = '01-overview.html'; image = '04-regression-overview.png'; description = 'Summary of the run status and executed checks.' },
  @{ title = 'Test output'; source = '05-test-results.html'; image = '05-test-output.png'; description = 'Console output for each test included in the run.' }
)

$capturedShots = @()
$screenshotWarnings = @()
foreach ($definition in $shotDefinitions) {
  $sourcePath = Join-Path $runDir $definition.source
  if (Test-Path $sourcePath) {
    $outputPath = Join-Path $screenshotsDir $definition.image
    $captureError = Invoke-Screenshot -RootPath $rootPath -PagePath $sourcePath -OutputPath $outputPath
    $captured = [string]::IsNullOrWhiteSpace($captureError)
    if (-not $captured) {
      $screenshotWarnings += "[$($definition.image)] $captureError"
    }

    $capturedShots += [pscustomobject]@{
      title = $definition.title
      source = $definition.source
      image = $definition.image
      description = $definition.description
      captured = $captured
      error = $captureError
    }
  }
}

if ($screenshotWarnings.Count -gt 0) {
  Add-Content -Path $logPath -Value @(
    '[warning] One or more screenshots could not be captured; source artifacts were still published.'
    $screenshotWarnings
  )
}

$listingRows = Get-ChildItem -Path $runDir | Sort-Object Name | ForEach-Object {
  $length = if ($_.PSIsContainer) { '' } else { [string]$_.Length }
  "<tr><td>$(HtmlEncode $_.Name)</td><td>$(HtmlEncode $length)</td><td>$(HtmlEncode ([string]$_.LastWriteTime))</td></tr>"
}

New-Page -Path (Join-Path $runDir '06-run-listing.html') -Title 'Run Listing' -Body @"
<div class="panel">
  <h1>Run Artifact Listing</h1>
  <p><strong>Run directory:</strong> <code>$(HtmlEncode $runDir)</code></p>
</div>
<div class="panel">
  <table>
    <thead><tr><th>Name</th><th>Length</th><th>LastWriteTime</th></tr></thead>
    <tbody>
      $($listingRows -join "`n")
    </tbody>
  </table>
</div>
"@

$manifest = [pscustomobject]@{
  timestamp = $timestamp
  generated_at = $generatedAt
  status = $status
  run_dir = $runDir
  screenshots = $capturedShots
  tests = $results | ForEach-Object {
    [pscustomobject]@{
      name = $_.name
      status = $_.status
      command = $_.command
    }
  }
}

Set-Content -Path (Join-Path $runDir 'manifest.json') -Value ($manifest | ConvertTo-Json -Depth 6) -Encoding utf8
Set-Content -Path $currentRunPath -Value @(
  "timestamp=$timestamp"
  "run_dir=$runDir"
) -Encoding utf8

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $testsRoot 'publish-latest-regression-gallery.ps1') -Root $rootPath -RunDir $runDir

if ($status -ne 'PASS') {
  throw "Regression run failed. Review $logPath"
}

Write-Output $runDir
