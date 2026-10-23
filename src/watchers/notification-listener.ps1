# Pingo notification listener (runs under Windows PowerShell 5.1).
# Polls the Windows notification center through the UserNotificationListener
# WinRT API and prints one JSON line per NEW toast:
#   {"app":"WhatsApp","aumid":"...","texts":["Priya","Lunch at 1?"],"avatar":"https://...","time":1700000000000}
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

# The WinRT API only exposes a toast's text. The sender's profile picture
# (<image placement="appLogoOverride" src="...">) is in the toast XML, which
# Windows keeps in its notification database. Read it read-only with the
# SQLite engine that ships with Windows (winsqlite3.dll).
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PingoWpn {
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_open_v2")] static extern int Open(byte[] file, out IntPtr db, int flags, IntPtr vfs);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_prepare_v2")] static extern int Prepare(IntPtr db, byte[] sql, int len, out IntPtr st, IntPtr tail);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_bind_int64")] static extern int BindInt64(IntPtr st, int i, long v);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_step")] static extern int Step(IntPtr st);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_column_blob")] static extern IntPtr ColumnBlob(IntPtr st, int i);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_column_bytes")] static extern int ColumnBytes(IntPtr st, int i);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_finalize")] static extern int Finalize(IntPtr st);
  [DllImport("winsqlite3.dll", EntryPoint = "sqlite3_close")] static extern int Close(IntPtr db);
  static byte[] Z(string s) { return Encoding.UTF8.GetBytes(s + "\0"); }
  public static string Payload(string path, long id) {
    IntPtr db;
    if (Open(Z(path), out db, 1 /* SQLITE_OPEN_READONLY */, IntPtr.Zero) != 0) { Close(db); return null; }
    try {
      IntPtr st;
      if (Prepare(db, Z("SELECT Payload FROM Notification WHERE Id = ?1"), -1, out st, IntPtr.Zero) != 0) return null;
      try {
        BindInt64(st, 1, id);
        if (Step(st) != 100 /* SQLITE_ROW */) return null;
        int n = ColumnBytes(st, 0);
        IntPtr p = ColumnBlob(st, 0);
        if (p == IntPtr.Zero || n <= 0) return null;
        byte[] buf = new byte[n];
        Marshal.Copy(p, buf, 0, n);
        return Encoding.UTF8.GetString(buf);
      } finally { Finalize(st); }
    } finally { Close(db); }
  }
}
'@
$wpnDb = Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Notifications\wpndatabase.db'
# only look up pictures for chat apps (PINGO_AVATAR_APPS widens this for tests)
$avatarApps = if ($env:PINGO_AVATAR_APPS) { $env:PINGO_AVATAR_APPS } else { 'WhatsApp|Telegram' }

function Get-Avatar([long]$id) {
  for ($try = 0; $try -lt 3; $try++) {
    $xml = $null
    try { $xml = [PingoWpn]::Payload($wpnDb, $id) } catch { }
    if ($xml) {
      $tag = [regex]::Match($xml, '<image\b[^>]*placement="appLogoOverride"[^>]*>')
      if (-not $tag.Success) { return $null }
      $src = [regex]::Match($tag.Value, '\bsrc="([^"]+)"')
      if ($src.Success) { return [System.Net.WebUtility]::HtmlDecode($src.Groups[1].Value) }
      return $null
    }
    Start-Sleep -Milliseconds 250   # row may land a moment after the toast
  }
  return $null
}

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
      $app = $n.AppInfo.DisplayInfo.DisplayName
      $aumid = $n.AppInfo.AppUserModelId
      $avatar = $null
      if ("$app $aumid" -match $avatarApps) { $avatar = Get-Avatar ([long]$n.Id) }
      Emit @{
        app    = $app
        aumid  = $aumid
        texts  = $texts
        avatar = $avatar
        time   = $n.CreationTime.ToUnixTimeMilliseconds()
      }
    }
    $previous = $current
  } catch {
    Emit @{ error = $_.Exception.Message }
  }
  Start-Sleep -Milliseconds 1200
}
