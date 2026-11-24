<#
.SYNOPSIS
  注册 / 移除 TechPulse DSH 桥接的开机自启任务。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-bridge.ps1
  powershell -ExecutionPolicy Bypass -File .\install-bridge.ps1 -Port 8787
  powershell -ExecutionPolicy Bypass -File .\install-bridge.ps1 -Remove
#>
param(
  [string]$NodePath,
  [int]$Port = 8787,
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$taskName = 'TechPulse-DSHBridge'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "已移除计划任务 $taskName（正在运行的桥接进程可用 Get-Process node 结束后台进程）。"
  return
}

if (-not $NodePath) {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if ($command) {
    $NodePath = $command.Source
  } elseif (Test-Path 'D:\AI-Tools\nodejs\node.exe') {
    $NodePath = 'D:\AI-Tools\nodejs\node.exe'
  } elseif (Test-Path 'C:\Program Files\nodejs\node.exe') {
    $NodePath = 'C:\Program Files\nodejs\node.exe'
  }
}
if ($NodePath -and -not (Test-Path $NodePath)) { throw "node.exe 不存在：$NodePath" }
if (-not $NodePath) { throw '找不到 node.exe，请用 -NodePath 指定完整路径。' }

$script = Join-Path $here 'dsh-phone-bridge.mjs'
if (-not (Test-Path $script)) { throw "缺少桥接脚本：$script" }

# 用 VBScript 以隐藏窗口启动，避免每次登录弹一个黑框。
$vbs = Join-Path $here 'start-bridge.vbs'
$nl = [Environment]::NewLine
$vbsText = 'Set shell = CreateObject("WScript.Shell")' + $nl +
  'shell.Environment("PROCESS")("BRIDGE_PORT") = "' + $Port + '"' + $nl +
  'shell.Run """' + $NodePath + '"" ""' + $script + '""", 0, False'
Set-Content -Path $vbs -Value $vbsText -Encoding Default

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"') -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force -Description 'TechPulse DSH bridge: loopback proxy for the DSH desktop web GUI (Tailscale only).' | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

$health = $null
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__health" -TimeoutSec 5
} catch {
  Write-Warning "桥接已注册，但健康检查失败：$($_.Exception.Message)"
}

Write-Host ""
Write-Host "任务 $taskName 已注册（登录自启），桥接监听 http://127.0.0.1:$Port"
if ($health) {
  Write-Host ("健康检查：ok={0} dsh_port={1}" -f $health.ok, $health.port)
  if (-not $health.ok) { Write-Host '提示：DSH 桌面版还没启动，打开一次即可。' }
}
Write-Host ""
Write-Host "下一步（只需一次）："
Write-Host "  tailscale serve --bg $Port"
Write-Host "  tailscale status   # 记下 Self 行的 xxx.yyy.ts.net，手机里填 https://xxx.yyy.ts.net/"
Write-Host ""
Write-Host "移除：powershell -ExecutionPolicy Bypass -File .\install-bridge.ps1 -Remove"
