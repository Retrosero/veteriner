<#
 .SYNOPSIS
 VetNiva PostgreSQL veritabanının Docker üzerinden geri yüklenebilir yedeğini alır.

 .DESCRIPTION
 GOAL-124 (FAZ-12) için PostgreSQL custom-format dump üretir. Yedek
 container içinde geçici dosya olarak oluşturulur ve sonra çalışma alanına
 kopyalanır; PowerShell metin yönlendirmesi kullanılmadığından ikili dump
 bozulmaz. Bu script veritabanını değiştirmez.

 .SECURITY
 Varsayılan container ve veritabanı yereldir. Parola komut satırına veya
 çıktıya yazılmaz. Üretimde secret manager kaynaklı bağlantı kullanılmalıdır.
#>
[CmdletBinding()]
param(
  [string]$Container = "vetniva-postgres",
  [string]$Database = "vetniva",
  [string]$User = "vetniva",
  [string]$OutputDirectory = "temp/backups"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
$outputFile = Join-Path $outputRoot "${Database}-${timestamp}.dump"
$containerFile = "/tmp/vetniva-${timestamp}.dump"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

try {
  docker exec $Container pg_dump -U $User -Fc -d $Database -f $containerFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump başarısız oldu." }

  docker cp "${Container}:$containerFile" $outputFile
  if ($LASTEXITCODE -ne 0) { throw "Yedek dosyası container'dan alınamadı." }

  $size = (Get-Item -LiteralPath $outputFile).Length
  if ($size -le 0) { throw "Oluşturulan yedek boş." }

  [PSCustomObject]@{
    backupFile = $outputFile
    bytes = $size
    database = $Database
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress
}
finally {
  docker exec $Container rm -f $containerFile 2>$null | Out-Null
}
