param(
  [string]$Root = 'C:/dev/skilf',
  [int]$Port = 3999,
  [string]$ProbePath = 'regression-artifacts/tester/latest/index.html'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$rootPath = (Resolve-Path $Root).Path
$probeUrl = "http://127.0.0.1:$Port/$($ProbePath.TrimStart('/'))"

try {
  $probe = Invoke-WebRequest -UseBasicParsing $probeUrl -TimeoutSec 2
  if ($probe.StatusCode -eq 200) {
    Write-Output $probeUrl
    exit 0
  }
} catch {
}

$npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if ($null -eq $npxCommand) {
  throw 'Unable to start workspace server: npx.cmd was not found on PATH.'
}

$process = Start-Process -FilePath $npxCommand.Source `
  -ArgumentList @('serve', '.', '-l', $Port, '--no-clipboard') `
  -WorkingDirectory $rootPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 2

$probe = Invoke-WebRequest -UseBasicParsing $probeUrl -TimeoutSec 5
if ($probe.StatusCode -ne 200) {
  throw "Gallery server started as PID $($process.Id) but $probeUrl did not return 200."
}

Write-Output $probeUrl
