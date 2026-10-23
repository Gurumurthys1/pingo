# Pingo notification listener (runs under Windows PowerShell 5.1).
# Polls the Windows notification center through the UserNotificationListener
# WinRT API and prints one JSON line per NEW toast:
#   {"app":"WhatsApp","aumid":"...","texts":["Priya","Lunch at 1?"],"time":1700000000000}
# Status lines look like {"status":"allowed"} / {"status":"denied"}.
# Nothing leaves this PC: Pingo's main process reads stdout and that's it.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
function Emit($obj) { [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 4)); [Console]::Out.Flush() }

[Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null

$listener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$access = Await ($listener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
if ($access -ne 'Allowed') { Emit @{ status = 'denied' }; exit 2 }

$listType = [System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]]
$previous = $null   # ids seen on the last poll; first poll only records what's already there
$toastsOn = $null
$pushKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications'

while ($true) {
  # With Windows notifications switched off, apps never create toasts at all.
  $flag = (Get-ItemProperty -Path $pushKey -Name ToastEnabled -ErrorAction SilentlyContinue).ToastEnabled
  $on = ($flag -ne 0)
  if ($on -ne $toastsOn) {
    $toastsOn = $on
    Emit @{ status = $(if ($on) { 'allowed' } else { 'toasts-off' }) }
  }
  try {
    $list = Await ($listener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) $listType
    $current = @{}
    foreach ($n in $list) {
      $current[[string]$n.Id] = $true
      if ($null -eq $previous -or $previous.ContainsKey([string]$n.Id)) { continue }
      $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
      if ($null -eq $binding) { continue }
      $texts = @($binding.GetTextElements() | ForEach-Object { $_.Text })
      Emit @{
        app   = $n.AppInfo.DisplayInfo.DisplayName
        aumid = $n.AppInfo.AppUserModelId
        texts = $texts
        time  = $n.CreationTime.ToUnixTimeMilliseconds()
      }
    }
    $previous = $current
  } catch {
    Emit @{ error = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds 1200
}
