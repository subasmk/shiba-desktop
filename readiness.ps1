# Read-only Shiba readiness check. No installs, keys, process termination, network changes or startup tasks.
$ErrorActionPreference = 'Continue'
function LocalProbe([string]$Url) {
 try { $r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -MaximumRedirection 0; @{url=$Url;status=[int]$r.StatusCode} }
 catch { @{url=$Url;error=$_.Exception.Message} }
}
$os=Get-CimInstance Win32_OperatingSystem
$gpu=Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion
$disks=Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID,@{n='freeGB';e={[math]::Round($_.FreeSpace/1GB,1)}}
$tags=$null
try { $tags=(Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3).models | Select-Object name,size } catch {}
$cuda=$null
if(Get-Command nvidia-smi -ErrorAction SilentlyContinue) { $cuda=& nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader }
# App names only from Windows Start menu. No usage history, documents, keys or executable commands.
$appNames=@()
try { $appNames=@(Get-StartApps | Select-Object -ExpandProperty Name | Sort-Object -Unique) } catch {}
$voices=@()
try { Add-Type -AssemblyName System.Speech;$speech=New-Object System.Speech.Synthesis.SpeechSynthesizer;$voices=$speech.GetInstalledVoices() | ForEach-Object {$_.VoiceInfo|Select-Object Name,Culture,Gender};$speech.Dispose() } catch {}
@{ramTotalGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1);ramFreeGB=[math]::Round($os.FreePhysicalMemory/1MB,1);gpu=$gpu;nvidiaMemory=$cuda;disks=$disks;ollamaModels=$tags;n8n=LocalProbe 'http://127.0.0.1:5678/healthz';voices=$voices;installedAppNames=$appNames} | ConvertTo-Json -Depth 5
