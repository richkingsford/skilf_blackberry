$ErrorActionPreference = 'Stop'

$indexPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'index.html'
if (-not (Test-Path $indexPath)) { throw "Missing title page at $indexPath" }

$raw = Get-Content $indexPath -Raw

if ($raw -notmatch '<h1 class="app-title">\s*Skilf\s*</h1>') {
  throw 'Expected app title heading with Skilf branding.'
}

if ($raw -notmatch 'function\s+genExperts\s*\(') {
  throw 'Expected production homepage to generate expert cards in-browser.'
}

if ($raw -notmatch 'function\s+genPartners\s*\(') {
  throw 'Expected production homepage to generate partner cards in-browser.'
}

if ($raw -match 'google\.com/forms') {
  throw 'Expected homepage CTAs to use the local application form, not Google Forms.'
}

if ($raw -notmatch 'href="apply\.html') {
  throw 'Expected homepage CTAs to link to apply.html.'
}

if ($raw -match 'Demo Day</a>\s*\(\$100 each\)') {
  throw 'Expected the homepage tagline to omit the old price parenthetical.'
}

Write-Output 'PASS: index.html uses the production homepage, local form, and updated tagline.'
