$ErrorActionPreference = 'Stop'

$indexPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'index.html'
if (-not (Test-Path $indexPath)) { throw "Missing title page at $indexPath" }

$raw = Get-Content $indexPath -Raw

if ($raw -match '<h1 class="app-title">\s*Skilf\s*</h1>') {
  throw 'Expected the old yellow Skilf title heading to be removed.'
}

if ($raw -notmatch 'class="site-nav-cta"[^>]*>\s*Begin a Skilf\s*</a>') {
  throw 'Expected the top navigation CTA to say Begin a Skilf.'
}

if ($raw -notmatch '<a href="defense-day\.html">\s*\$500/Demo Day\s*</a>') {
  throw 'Expected the top navigation Demo Day link to say $500/Demo Day.'
}

if ($raw -notmatch '<button class="site-auth-btn"[^>]*data-auth-action="sign-in"[^>]*>\s*Sign in\s*</button>\s*<span class="site-auth-menu-wrap"[^>]*data-auth-profile[^>]*hidden>[\s\S]*?<span class="site-auth-menu"[^>]*data-auth-menu[^>]*hidden[\s\S]*?<button class="site-auth-menu-btn"[^>]*data-auth-action="sign-out"[^>]*>\s*Log out\s*</button>[\s\S]*?</span>\s*</span>\s*<a class="site-nav-cta"') {
  throw 'Expected the nav auth controls to use Sign in, a profile dropdown, then Begin a Skilf.'
}

if ($raw -notmatch 'if\(!auth\.user\)\{\s*showSendLoginPrompt\(send,auth\);' -or $raw -notmatch 'Sign in with Google to send this message\.') {
  throw 'Expected send buttons to show a local sign-in prompt before sending.'
}

if ($raw -match 'Robotics Skilf|VR App Skilf') {
  throw 'Expected homepage showcase kicker labels to be removed.'
}

if ($raw -notmatch '<a class="cta" href="apply\.html">\s*Begin your own Skilf adventure') {
  throw 'Expected the homepage to keep the Begin your own Skilf adventure CTA.'
}

if (($raw | Select-String -Pattern 'Begin your own Skilf adventure' -AllMatches).Matches.Count -ne 1) {
  throw 'Expected the Begin your own Skilf adventure CTA to appear once.'
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
