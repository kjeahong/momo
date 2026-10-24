$WshShell = New-Object -ComObject WScript.Shell

# 1. Shortcut directly on Windows Desktop
$desktopPath = "C:\Users\Administrator\Desktop\Momo.lnk"
$s1 = $WshShell.CreateShortcut($desktopPath)
$s1.TargetPath = "C:\Users\Administrator\Desktop\momo\release\win-unpacked\Momo.exe"
$s1.Arguments = "--no-sandbox"
$s1.WorkingDirectory = "C:\Users\Administrator\Desktop\momo\release\win-unpacked"
$s1.IconLocation = "C:\Users\Administrator\Desktop\momo\build\icon.ico"
$s1.Description = "Momo - 기억을 찾아주는 스마트 노트"
$s1.Save()

# 2. Shortcut inside the momo folder
$momoPath = "C:\Users\Administrator\Desktop\momo\Momo.lnk"
$s2 = $WshShell.CreateShortcut($momoPath)
$s2.TargetPath = "C:\Users\Administrator\Desktop\momo\release\win-unpacked\Momo.exe"
$s2.Arguments = "--no-sandbox"
$s2.WorkingDirectory = "C:\Users\Administrator\Desktop\momo\release\win-unpacked"
$s2.IconLocation = "C:\Users\Administrator\Desktop\momo\build\icon.ico"
$s2.Description = "Momo - 기억을 찾아주는 스마트 노트"
$s2.Save()

Write-Host "Desktop shortcut created: $desktopPath"
Write-Host "Folder shortcut created: $momoPath"
