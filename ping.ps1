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

    [ValidateSet('success', 'error', 'warning', 'info', 'busy')]
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
    Write-Host "   -Status    (Optional) success | error | warning | info | busy (default: info)"
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
    $LogFile = Join-Path $env:APPDATA "ping-ping\startup.log"
    $LogDir = Split-Path $LogFile
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force }

    Write-Host "ping-ping server is offline. Starting it in the background..."
    
    # Use direct Node execution via cmd for redirection with hidden window
    # Node modules path needs careful escaping for cmd.exe
    $ElectronCli = Join-Path $PSScriptRoot "node_modules\electron\cli.js"
    $CmdArgs = "/c node `"$ElectronCli`" . --no-sandbox > `"$LogFile`" 2>&1"
    
    Start-Process -FilePath "cmd.exe" -ArgumentList $CmdArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    
    Write-Host "Waiting for server to spin up..."
    
    $maxStartupRetries = 10
    $retryInterval = 3 # seconds
    $startupSuccess = $false

    for ($i = 1; $i -le $maxStartupRetries; $i++) {
        Start-Sleep -Seconds $retryInterval
        Write-Host "Checking health (attempt $i/$maxStartupRetries)..."
        try {
            $health = Invoke-RestMethod -Uri $HealthUri -Method Get -ErrorAction Stop
            if ($health.ok) {
                $startupSuccess = $true
                break
            }
        } catch {
            # Continue waiting
        }
    }

    if (-not $startupSuccess) {
        Write-Error "ping-ping server failed to start after $(($maxStartupRetries * $retryInterval)) seconds."
        Write-Error "Check '$LogFile' for details."
        exit 1
    }
}

# 3. Send the notification (with minor retry logic for transient startup delay)
$maxSendRetries = 3
$sendSuccess = $false

for ($i = 1; $i -le $maxSendRetries; $i++) {
    try {
        $Response = Invoke-RestMethod -Uri $Uri -Method Post -Headers $Headers -Body $Payload -ErrorAction Stop
        Write-Output "Ping sent successfully (ID: $($Response.id))"
        $sendSuccess = $true
        break
    } catch {
        if ($i -eq $maxSendRetries) {
            Write-Error "Failed to send ping after $maxSendRetries attempts."
            if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                Write-Error "Server response: $($_.ErrorDetails.Message)"
            } else {
                Write-Error $_.Exception.Message
            }
            exit 1
        }
        Write-Warning "Notification failed, retrying in 2s... (attempt $i/$maxSendRetries)"
        Start-Sleep -Seconds 2
    }
}
