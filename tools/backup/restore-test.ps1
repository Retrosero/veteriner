<#
 .SYNOPSIS
 VetNiva PostgreSQL yedeğini ayrı geçici veritabanına geri yükler ve doğrular.

 .DESCRIPTION
 GOAL-124 (FAZ-12) restore kanıtı için custom-format dump'ı geçici bir
 veritabanına geri yükler. Oluşturduğu veritabanı yalnızca bu scriptin ürettiği
 `vetniva_restore_test_` önekiyle sınırlıdır ve işlem sonunda silinir.

 .SECURITY
 Canlı `vetniva` veritabanına yazmaz veya onu silmez. Her komut hedefini
 doğrular; yedek dosyası workspace altında veya kullanıcı tarafından açıkça
 verilen erişilebilir bir yolda olmalıdır.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$BackupFile,
  [string]$Container = "vetniva-postgres",
  [string]$User = "vetniva"
)

$ErrorActionPreference = "Stop"
$restoreDatabase = "vetniva_restore_test_$(Get-Date -Format 'yyyyMMddHHmmss')"
if (-not $restoreDatabase.StartsWith("vetniva_restore_test_")) {
  throw "Geçersiz geçici restore veritabanı adı."
}
$containerFile = "/tmp/$([System.IO.Path]::GetFileName($BackupFile))"
$created = $false

try {
  docker cp $BackupFile "${Container}:$containerFile"
  if ($LASTEXITCODE -ne 0) { throw "Yedek dosyası container'a kopyalanamadı." }

  docker exec $Container createdb -U $User $restoreDatabase
  if ($LASTEXITCODE -ne 0) { throw "Geçici restore veritabanı oluşturulamadı." }
  $created = $true

  docker exec $Container pg_restore -U $User -d $restoreDatabase $containerFile
  if ($LASTEXITCODE -ne 0) { throw "pg_restore başarısız oldu." }

  $checks = @("tenants", "owners", "patients")
  $counts = @{}
  foreach ($table in $checks) {
    $result = docker exec $Container psql -U $User -d $restoreDatabase -At -c "SELECT count(*) FROM `"$table`";"
    if ($LASTEXITCODE -ne 0) { throw "Restore edilen $table tablosu doğrulanamadı." }
    $counts[$table.ToLowerInvariant()] = [int]$result
  }

  [PSCustomObject]@{
    restoreDatabase = $restoreDatabase
    backupFile = [System.IO.Path]::GetFullPath($BackupFile)
    verifiedTables = $counts
    restoredAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json -Compress
}
finally {
  docker exec $Container rm -f $containerFile 2>$null | Out-Null
  if ($created) {
    docker exec $Container dropdb -U $User --if-exists $restoreDatabase 2>$null | Out-Null
  }
}
