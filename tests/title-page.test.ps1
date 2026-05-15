$ErrorActionPreference = 'Stop'

$indexPath = 'C:/dev/skilf/index.html'
if (-not (Test-Path $indexPath)) { throw "Missing title page at $indexPath" }

$raw = Get-Content $indexPath -Raw

if ($raw -notmatch '<h1 class="app-title">\s*Skilf\s*</h1>') {
  throw 'Expected app title heading with Skilf branding.'
}

if ($raw -notmatch "loadJsonFixture\('experts.json'\)") {
  throw 'Expected experts grid to load from experts.json fixture.'
}

if ($raw -notmatch "loadJsonFixture\('prospectivePartners.json'\)") {
  throw 'Expected partners grid to load from prospectivePartners.json fixture.'
}

if ($raw -match 'function\s+genExperts\s*\(') {
  throw 'Did not expect browser-generated experts data function.'
}

if ($raw -match 'function\s+genPartners\s*\(') {
  throw 'Did not expect browser-generated partners data function.'
}

Write-Output 'PASS: index.html loads both card grids from checked-in JSON fixtures.'
