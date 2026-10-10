param([Parameter(Mandatory=$true)][string]$Helper)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if (-not [IO.Directory]::Exists($env:TEMP)) { throw 'Synthetic TEMP missing' }
if (-not $env:TEMP.Contains([string][char]0x017C + [char]0x00F3 + [char]0x0142 + [char]0x0107)) { throw 'Synthetic TEMP Unicode mismatch' }
if ($env:POWERSHELL_TELEMETRY_OPTOUT -ne '1' -or $env:POWERSHELL_UPDATECHECK -ne 'Off') { throw 'helper controls missing' }
Add-Type -TypeDefinition ([IO.File]::ReadAllText($Helper))
[pscustomobject]@{
    compiled = ($null -ne ('LocalWindowsJob' -as [type]))
    runInvoked = $false
    ps = $PSVersionTable.PSVersion.ToString()
    dotnet = [System.Runtime.InteropServices.RuntimeInformation]::FrameworkDescription
} | ConvertTo-Json -Compress
