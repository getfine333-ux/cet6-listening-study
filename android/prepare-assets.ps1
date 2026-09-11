$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $projectRoot
$webSource = Join-Path $repoRoot 'web\dist'
$audioSource = Join-Path $repoRoot 'resources'
$assetRoot = Join-Path $projectRoot 'app\src\main\assets'
$webTarget = Join-Path $assetRoot 'www'
$audioTarget = Join-Path $assetRoot 'audio'

New-Item -ItemType Directory -Path $webTarget -Force | Out-Null
New-Item -ItemType Directory -Path $audioTarget -Force | Out-Null
'index.html','styles.css','quiz.css','app.js','favicon.svg','data.js' | ForEach-Object {
    Copy-Item -LiteralPath (Join-Path $webSource $_) -Destination $webTarget -Force
}
$dataPath = Join-Path $webTarget 'data.js'
$data = Get-Content -LiteralPath $dataPath -Raw
$data = $data.Replace('../../resources/', '../audio/')
Set-Content -LiteralPath $dataPath -Value $data -Encoding utf8NoBOM

Get-ChildItem -LiteralPath $audioSource -Directory -Filter 'CET6_*' | ForEach-Object {
    $targetFolder = Join-Path $audioTarget $_.Name
    New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    Get-ChildItem -LiteralPath $_.FullName -File |
        Where-Object { $_.Extension -in '.mp3', '.m4a' } |
        Copy-Item -Destination $targetFolder -Force
}

$audioFiles = Get-ChildItem -LiteralPath $audioTarget -Recurse -File
[pscustomobject]@{ AudioFiles = $audioFiles.Count; TotalMB = [math]::Round(($audioFiles | Measure-Object Length -Sum).Sum / 1MB, 2) }
