param([Parameter(ValueFromRemainingArguments=$true)][string[]]$NpmArgs)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:npm_config_cache = Join-Path $projectRoot '.cache/npm'
$env:npm_config_audit = 'false'
$env:npm_config_fund = 'false'
$env:ELECTRON_CACHE = Join-Path $projectRoot '.cache/electron'
$env:electron_config_cache = $env:ELECTRON_CACHE
$env:NODE_USE_ENV_PROXY = '1'
$env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot '.cache/electron-builder'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $projectRoot '.cache/playwright'
$env:TEMP = Join-Path $projectRoot '.cache/temp'
$env:TMP = $env:TEMP
$env:RESUME_DATA_DIR = Join-Path $projectRoot '.local-data'
@($env:npm_config_cache,$env:ELECTRON_CACHE,$env:ELECTRON_BUILDER_CACHE,$env:PLAYWRIGHT_BROWSERS_PATH,$env:TEMP,$env:RESUME_DATA_DIR) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
if ($NpmArgs.Length -gt 2 -and $NpmArgs[0] -eq 'run' -and $NpmArgs[2] -ne '--') { $NpmArgs = $NpmArgs[0..1] + @('--') + $NpmArgs[2..($NpmArgs.Length - 1)] }
& npm.cmd @NpmArgs
exit $LASTEXITCODE


