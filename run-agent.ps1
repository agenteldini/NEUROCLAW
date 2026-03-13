$host.UI.RawUI.WindowTitle = "NEUROCLAW Agent"
$url = "https://www.neuroclaw.fun"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  NEUROCLAW Agent Loop - Every 15 minutes  " -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop.                    " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

while ($true) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  CYCLE START  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow

    Write-Host "`n> /api/agent/cycle ..." -ForegroundColor Gray
    try {
        $cycle = Invoke-RestMethod -Uri "$url/api/agent/cycle" -Method GET -TimeoutSec 60
        if ($cycle.skipped) {
            Write-Host "  SKIPPED (balance below minimum)" -ForegroundColor DarkYellow
        } else {
            Write-Host "  migrated : $($cycle.migrated)" -ForegroundColor White
            Write-Host "  strategy : $($cycle.strategy)" -ForegroundColor White
            Write-Host "  claimed  : $($cycle.claimed) SOL" -ForegroundColor Green
            Write-Host "  buyback  : $($cycle.boughtBack) SOL" -ForegroundColor Green
            Write-Host "  burned   : $($cycle.burned) tokens" -ForegroundColor Green
            Write-Host "  lpSol    : $($cycle.lpSol) SOL" -ForegroundColor $(if ($cycle.lpSol -gt 0) { "Cyan" } else { "White" })
            if ($cycle.lpError) {
                Write-Host "  lpError  : $($cycle.lpError)" -ForegroundColor Red
            }
            Write-Host "  txs      : $($cycle.txs.Count) transactions" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host "`n  Waiting 5s for chain confirmation..." -ForegroundColor Gray
    Start-Sleep -Seconds 5

    Write-Host "`n> /api/agent/think ..." -ForegroundColor Gray
    try {
        $think = Invoke-RestMethod -Uri "$url/api/agent/think" -Method GET -TimeoutSec 60
        Write-Host "  day   : $($think.day)" -ForegroundColor White
        Write-Host "  mood  : $($think.log.mood)" -ForegroundColor Magenta
        Write-Host "  title : $($think.log.title)" -ForegroundColor White
        Write-Host "  body  : $($think.log.body.Substring(0, [Math]::Min(120, $think.log.body.Length)))..." -ForegroundColor Gray
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "  CYCLE DONE  $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow

    for ($i = 15; $i -gt 0; $i--) {
        Write-Host "`r  Next cycle in $i min...  " -NoNewline -ForegroundColor DarkGray
        Start-Sleep -Seconds 60
    }
    Write-Host ""
}
