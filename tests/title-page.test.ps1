$ErrorActionPreference = 'Stop'

$indexPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'index.html'
if (-not (Test-Path $indexPath)) { throw "Missing title page at $indexPath" }

$raw = Get-Content $indexPath -Raw

if ($raw -match '<h1 class="app-title">\s*Skilf\s*</h1>') {
  throw 'Expected the old yellow Skilf title heading to be removed.'
}

if ($raw -notmatch '<details class="site-adventure">[\s\S]*?<summary class="site-nav-cta">\s*Begin HighBar\s*</summary>[\s\S]*?<span class="site-adventure-label">\s*Choose a path\s*</span>[\s\S]*?href="apply\.html#intern"[\s\S]*?href="apply\.html#scholarship"[\s\S]*?href="apply\.html#board-member"[\s\S]*?href="apply\.html#mentor"[\s\S]*?href="apply\.html#hire"[\s\S]*?href="apply\.html#company-project"[\s\S]*?href="apply\.html#feedback"[\s\S]*?</details>') {
  throw 'Expected the top navigation CTA to use the Begin HighBar dropdown with path options.'
}

$headerMatch = [regex]::Match($raw, '<header class="site-nav">[\s\S]*?</header>')
if (-not $headerMatch.Success) {
  throw 'Expected the homepage to include the shared top navigation.'
}

if ($headerMatch.Value -match '<a href="defense-day\.html"[^>]*>\s*Demo Day\s*</a>') {
  throw 'Expected the top navigation Demo Day link to be removed.'
}

if ($raw -notmatch '<button class="site-auth-btn"[^>]*data-auth-action="sign-in"[^>]*>\s*Sign in\s*</button>\s*<span class="site-auth-menu-wrap"[^>]*data-auth-profile[^>]*hidden>[\s\S]*?<span class="site-auth-menu"[^>]*data-auth-menu[^>]*hidden[\s\S]*?<button class="site-auth-menu-btn"[^>]*data-auth-action="sign-out"[^>]*>\s*Log out\s*</button>[\s\S]*?</span>\s*</span>\s*<details class="site-adventure">[\s\S]*?Begin HighBar') {
  throw 'Expected the nav auth controls to use Sign in, a profile dropdown, then Begin HighBar.'
}

if ($raw -notmatch 'if\(!auth\.user\)\{\s*showSendLoginPrompt\(send,auth\);' -or $raw -notmatch 'Sign in with Google\. Only registered mentors, applicants, and board members can send messages\.') {
  throw 'Expected send buttons to show a local sign-in prompt before sending.'
}

if ($raw -match 'Robotics Skilf|VR App Skilf') {
  throw 'Expected homepage showcase kicker labels to be removed.'
}

if ($raw -notmatch '<div class="home-final-actions"[\s\S]*?href="apply\.html"[\s\S]*?>\s*Begin your HighBar path[\s\S]*?href="monetize\.html"[\s\S]*?>\s*Hire or mentor an applicant\s*</a>[\s\S]*?</div>') {
  throw 'Expected homepage bottom CTAs to be Begin your HighBar path and Hire or mentor an applicant.'
}

if ($raw -match 'Apply for a scholarship') {
  throw 'Expected scholarship bottom homepage CTA to be removed.'
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

Write-Output 'PASS: index.html uses the production homepage, local form, and updated navigation.'
