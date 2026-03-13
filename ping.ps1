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
    [Parameter(Mandatory=$true)]
    [string]$Title,

    [Parameter(Mandatory=$true)]
    [string]$Message,

    [ValidateSet('success', 'error', 'warning', 'info')]
    [string]$Status = 'info',

    [string]$Token = $env:PING_TOKEN
)

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
