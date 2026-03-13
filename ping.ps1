<#
.SYNOPSIS
Sends a local notification to out ping-ping dashboard.

.DESCRIPTION
A native Windows helper script that safely formats JSON and sends it via POST to the local ping-ping server (port 19999). It handles escaping, encoding, and error reporting cleanly.

.PARAMETER Title
The title of the notification.

.PARAMETER Message
The body text of the notification.

.PARAMETER Status
Optional. The severity level (success, warning, error, info). Defaults to 'info'.

.PARAMETER Token
Optional. Auth token (X-PING-TOKEN) if the server requires it. Alternatively, set the $env:PING_TOKEN environment variable.

.EXAMPLE
.\ping.ps1 -Title "Codex CLI" -Message "Task successfully completed!" -Status success
#>
param(
    [string]$Title,

    [string]$Message,

    [ValidateSet('success', 'error', 'warning', 'info')]
    [string]$Status = 'info',

    [string]$Token = $env:PING_TOKEN,

    [Alias('h')]
    [switch]$PrintHelp
)

$AppVersion = "1.0.1"

# Automatically print a robust AI-friendly manual if --help is requested or if completely blind (no args)
if ($PrintHelp -or ([string]::IsNullOrWhitespace($Title) -and [string]::IsNullOrWhitespace($Message))) {
    Write-Host ""
    Write-Host "============================================================"
    Write-Host " 🔔 ping-ping helper (v$AppVersion) - AI Workspace integration"
    Write-Host "============================================================"
    Write-Host ""
    Write-Host " DESCRIPTION:"
    Write-Host "   Sends a local Windows notification to the ping-ping dashboard."
    Write-Host "   If the ping-ping server is offline, this script automatically starts it."
    Write-Host ""
    Write-Host " AI AGENT CONTEXT & DISCOVERY:"
    Write-Host "   - To learn how to integrate this tool into your workflow..."
    Write-Host "   - To discover newly added features and version updates..."
    Write-Host "   👉 READ THE FILE: .internal/agents.md"
    Write-Host ""
    Write-Host " USAGE:"
    Write-Host "   .\ping.ps1 -Title <string> -Message <string> [-Status <string>]"
    Write-Host ""
    Write-Host " PARAMETERS:"
    Write-Host "   -Title     (Required) The header of the notification."
    Write-Host "   -Message   (Required) The body text."
    Write-Host "   -Status    (Optional) success | error | warning | info (default: info)"
    Write-Host "   -Token     (Optional) Auth token if PING_TOKEN is set in the environment."
    Write-Host "   -Help, -h  Show this documentation."
    Write-Host ""
    Write-Host " EXAMPLES:"
    Write-Host "   .\ping.ps1 -Title `"Codex`" -Message `"Hello World`" -Status success"
    Write-Host "============================================================"
    exit 0
}

# Enforce required parameters manually so PowerShell doesn't hang blocking for User Input
if ([string]::IsNullOrWhitespace($Title) -or [string]::IsNullOrWhitespace($Message)) {
    Write-Error "Both -Title and -Message are required. Run '.\ping.ps1 --help' for usage docs."
    exit 1
}

$Uri = "http://127.0.0.1:19999/ping"
$HealthUri = "http://127.0.0.1:19999/health"

$Payload = @{
    title   = $Title
    message = $Message
    status  = $Status
} | ConvertTo-Json -Compress

$Headers = @{
    "Content-Type" = "application/json"
}

if (![string]::IsNullOrEmpty($Token)) {
    $Headers["X-PING-TOKEN"] = $Token
}

# 1. Health check
$serverRunning = $false
try {
    $health = Invoke-RestMethod -Uri $HealthUri -Method Get -ErrorAction Stop
    if ($health.ok) {
        $serverRunning = $true
    }
} catch {
    # Server is likely offline
}

# 2. Auto-start if not running
if (-not $serverRunning) {
    Write-Host "ping-ping server is offline. Starting it in the background..."
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm start" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    
    Write-Host "Waiting for server to spin up..."
    Start-Sleep -Seconds 5
}

# 3. Send the notification
try {
    $Response = Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -Body $Payload -ErrorAction Stop
    Write-Output "Ping sent successfully (ID: $($Response.id))"
} catch {
    Write-Error "Failed to send ping."
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Error "Server response: $($_.ErrorDetails.Message)"
    } else {
        Write-Error $_.Exception.Message
    }
    exit 1
}
