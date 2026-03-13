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
