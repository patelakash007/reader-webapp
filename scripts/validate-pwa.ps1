$ErrorActionPreference = 'Stop'

$requiredPaths = @(
  'manifest.webmanifest',
  'sw.js',
  'index.html',
  'style.css',
  'script.js',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js',
  'vendor/mammoth.browser.min.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png'
)

$missing = $requiredPaths | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }

if ($missing.Count -gt 0) {
  Write-Error ("Missing required PWA files: " + ($missing -join ', '))
}

Write-Output "PWA validation passed: required app shell files exist."
