$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$expertsPath = Join-Path $root 'experts.json'
$partnersPath = Join-Path $root 'prospectivePartners.json'
if (-not (Test-Path $expertsPath)) { throw "Missing experts.json at $expertsPath" }
if (-not (Test-Path $partnersPath)) { throw "Missing prospectivePartners.json at $partnersPath" }

$experts = Get-Content $expertsPath -Raw | ConvertFrom-Json
$partners = Get-Content $partnersPath -Raw | ConvertFrom-Json

if ($experts.Count -ne 6) { throw "Expected exactly 6 experts, found $($experts.Count)" }
if ($partners.Count -lt 6) { throw "Expected at least 6 partners, found $($partners.Count)" }

function Convert-ToCanonicalListing {
  param(
    [Parameter(Mandatory = $true)]$Item,
    [Parameter(Mandatory = $true)][string]$Kind
  )

  if ($Kind -eq 'expert') {
    $headline = if ($Item.skill) { [string]$Item.skill } else { [string]$Item.field }
    $description = if ($Item.project) { [string]$Item.project } else { [string]$Item.bio }
    return [pscustomobject]@{
      kind = $Kind
      name = [string]$Item.name
      headline = $headline
      description = $description
      region = [string]$Item.region
      skilfId = [string]$Item.skilfId
      tags = @($Item.tags)
    }
  }

  $partnerHeadline = if ($Item.skill) { [string]$Item.skill } else { [string]$Item.project }
  return [pscustomobject]@{
    kind = $Kind
    name = [string]$Item.name
    headline = $partnerHeadline
    description = [string]$Item.project
    region = ''
    skilfId = ''
    tags = @($Item.tags)
  }
}

$listings = @()
$listings += $experts | ForEach-Object { Convert-ToCanonicalListing -Item $_ -Kind 'expert' }
$listings += $partners | ForEach-Object { Convert-ToCanonicalListing -Item $_ -Kind 'partner' }

$required = @('kind','name','headline','description','tags')
foreach ($listing in $listings) {
  foreach ($k in $required) {
    if (-not $listing.PSObject.Properties.Name.Contains($k)) { throw "Missing required canonical key '$k'" }
    if ($k -ne 'tags' -and [string]::IsNullOrWhiteSpace([string]$listing.$k)) { throw "Canonical key '$k' must be non-empty" }
  }

  if ($listing.tags.Count -lt 2) { throw "Expected at least 2 tags for '$($listing.name)'" }
}

$regions = $experts | ForEach-Object { $_.region }
$hasLargeCity = ($regions | Where-Object { $_ -match 'Boston|Austin|Chicago|Los Angeles|New York|London|Tokyo|Paris|Mumbai' }).Count -ge 1
$hasMediumCity = ($regions | Where-Object { $_ -match 'Pittsburgh|Dublin|Portland|Leeds|Lyon|Oslo|Valencia|Bologna' }).Count -ge 1
$smallCountries = @('Luxembourg','Ireland','Switzerland','Iceland','Malta','Estonia','Slovenia')
$hasSmallCountry = ($regions | Where-Object { $smallCountries -contains $_ }).Count -ge 1

if (-not $hasLargeCity) { throw 'Expected at least one large-city region.' }
if (-not $hasMediumCity) { throw 'Expected at least one medium-city region.' }
if (-not $hasSmallCountry) { throw 'Expected at least one small-country region.' }

Write-Output 'PASS: canonical listing contract validated for experts and partners fixtures.'
