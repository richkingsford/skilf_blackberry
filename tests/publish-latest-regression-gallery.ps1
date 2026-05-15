param(
  [string]$Root = 'C:/dev/skilf',
  [string]$RunDir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function HtmlEncode([string]$Text) {
  return [System.Net.WebUtility]::HtmlEncode($Text)
}

function Get-RunMetadata([string]$MetadataPath) {
  $map = @{}
  foreach ($line in Get-Content $MetadataPath) {
    if ($line -match '=') {
      $key, $value = $line -split '=', 2
      $map[$key.Trim()] = $value.Trim()
    }
  }

  return $map
}

$rootPath = (Resolve-Path $Root).Path
$artifactRoot = Join-Path $rootPath 'regression-artifacts/tester'
$runsRoot = Join-Path $artifactRoot 'runs'
$latestRoot = Join-Path $artifactRoot 'latest'

New-Item -ItemType Directory -Force -Path $latestRoot | Out-Null

if (-not $RunDir) {
  $currentRunPath = Join-Path $artifactRoot '.current-run.txt'
  if (Test-Path $currentRunPath) {
    $metadata = Get-RunMetadata -MetadataPath $currentRunPath
    if ($metadata.ContainsKey('run_dir') -and (Test-Path $metadata['run_dir'])) {
      $RunDir = $metadata['run_dir']
    }
  }
}

if (-not $RunDir) {
  $latestRun = Get-ChildItem -Path $runsRoot -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($null -eq $latestRun) {
    throw "No regression run directories found in $runsRoot"
  }

  $RunDir = $latestRun.FullName
}

$resolvedRunDir = (Resolve-Path $RunDir).Path
$runName = Split-Path $resolvedRunDir -Leaf
$manifestPath = Join-Path $resolvedRunDir 'manifest.json'
$manifest = $null

if (Test-Path $manifestPath) {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
}

$overviewPath = Join-Path $resolvedRunDir '01-overview.html'
$runListingPath = Join-Path $resolvedRunDir '06-run-listing.html'
$latestIndexPath = Join-Path $latestRoot 'index.html'
$latestMarkdownPath = Join-Path $latestRoot 'gallery.md'

$screenshotCards = @()
if ($null -ne $manifest -and @($manifest.screenshots).Count -gt 0) {
  foreach ($shot in $manifest.screenshots) {
    $imageHref = "../runs/$runName/screenshots/$($shot.image)"
    $sourceHref = "../runs/$runName/$($shot.source)"
    if ($shot.captured -eq $false) {
      $errorText = if ($shot.error) { [string]$shot.error } else { 'No capture error details were recorded.' }
      $screenshotCards += @"
<article class="card">
  <div class="card-body">
    <h2>$(HtmlEncode $shot.title)</h2>
    <p>$(HtmlEncode $shot.description)</p>
    <p><strong>Screenshot unavailable:</strong> $(HtmlEncode $errorText)</p>
    <a href="$sourceHref">Open source artifact</a>
  </div>
</article>
"@
      continue
    }

    $screenshotCards += @"
<article class="card">
  <img src="$imageHref" alt="$(HtmlEncode $shot.title)">
  <div class="card-body">
    <h2>$(HtmlEncode $shot.title)</h2>
    <p>$(HtmlEncode $shot.description)</p>
    <a href="$sourceHref">Open source artifact</a>
  </div>
</article>
"@
  }
}

$status = if ($null -ne $manifest -and $manifest.status) { [string]$manifest.status } else { 'UNKNOWN' }
$generatedAt = if ($null -ne $manifest -and $manifest.generated_at) { [string]$manifest.generated_at } else { (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') }
$testsSummary = ''
if ($null -ne $manifest -and @($manifest.tests).Count -gt 0) {
  $rows = foreach ($test in $manifest.tests) {
    "<tr><td>$(HtmlEncode $test.name)</td><td>$(HtmlEncode $test.status)</td><td><code>$(HtmlEncode $test.command)</code></td></tr>"
  }

  $testsSummary = @"
<section class="panel">
  <h2>Test Summary</h2>
  <table>
    <thead>
      <tr><th>Test</th><th>Status</th><th>Command</th></tr>
    </thead>
    <tbody>
      $($rows -join "`n")
    </tbody>
  </table>
</section>
"@
}

$galleryHtml = @"
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Latest Regression Gallery</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6fb;
      --panel: #ffffff;
      --border: #d5dfef;
      --text: #10243e;
      --muted: #5b6b82;
      --accent: #0f62fe;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(180deg, #eef4ff 0%, var(--bg) 45%, #f9fbff 100%);
      color: var(--text);
    }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }
    h1, h2 { margin: 0; }
    p { margin: 0; color: var(--muted); line-height: 1.5; }
    .hero, .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      box-shadow: 0 18px 40px rgba(16, 36, 62, 0.08);
    }
    .hero {
      display: grid;
      gap: 14px;
      margin-bottom: 20px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 0.95rem;
      color: var(--muted);
    }
    .meta strong { color: var(--text); }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .actions a {
      color: white;
      background: var(--accent);
      border-radius: 999px;
      padding: 10px 16px;
      text-decoration: none;
      font-weight: 600;
    }
    .actions a.secondary {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--border);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 18px;
      margin-top: 20px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 12px 32px rgba(16, 36, 62, 0.08);
    }
    .card img {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      background: #e7eefb;
    }
    .card-body {
      padding: 16px;
      display: grid;
      gap: 8px;
    }
    .card-body h2 {
      font-size: 1rem;
    }
    .card-body a {
      color: var(--accent);
      text-decoration: none;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-top: 1px solid var(--border);
      font-size: 0.95rem;
    }
    code {
      font-family: Consolas, monospace;
      font-size: 0.92rem;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div>
        <h1>Latest Regression Gallery</h1>
      </div>
      <p>Single-link proof page for the most recent tester run. Open the overview for details, or scan the visual captures below.</p>
      <div class="meta">
        <span><strong>Status:</strong> $(HtmlEncode $status)</span>
        <span><strong>Run:</strong> $(HtmlEncode $runName)</span>
        <span><strong>Generated:</strong> $(HtmlEncode $generatedAt)</span>
      </div>
      <div class="actions">
        <a href="../runs/$runName/01-overview.html">Open run overview</a>
        <a class="secondary" href="../runs/$runName/06-run-listing.html">Open run artifact listing</a>
      </div>
    </section>
    $testsSummary
    <section class="grid">
      $($screenshotCards -join "`n")
    </section>
  </main>
</body>
</html>
"@

Set-Content -Path $latestIndexPath -Value $galleryHtml -Encoding utf8

$markdownLines = @(
  '# Latest Regression Gallery',
  '',
  "- Status: $status",
  "- Run: ``$runName``",
  "- Generated: $generatedAt",
  '',
  "- [Run overview]($overviewPath)",
  "- [Run listing]($runListingPath)",
  ''
)

if ($null -ne $manifest -and @($manifest.screenshots).Count -gt 0) {
  foreach ($shot in $manifest.screenshots) {
    $absoluteSourcePath = Join-Path $resolvedRunDir $shot.source
    $markdownLines += "## $($shot.title)"
    $markdownLines += ''
    $markdownLines += $shot.description
    $markdownLines += ''
    $markdownLines += "- [Source artifact]($absoluteSourcePath)"
    if ($shot.captured -eq $false) {
      $errorText = if ($shot.error) { [string]$shot.error } else { 'No capture error details were recorded.' }
      $markdownLines += "- Screenshot unavailable: $errorText"
      $markdownLines += ''
      continue
    }
    $absoluteImagePath = Join-Path $resolvedRunDir "screenshots/$($shot.image)"
    $markdownLines += ''
    $markdownLines += "![$($shot.title)]($absoluteImagePath)"
    $markdownLines += ''
  }
}

Set-Content -Path $latestMarkdownPath -Value ($markdownLines -join "`n") -Encoding utf8
Write-Output $latestMarkdownPath
Write-Output $latestIndexPath
