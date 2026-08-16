' ============================================================
'  CoreRead - launcher
'  Opens CoreRead.html in a chromeless Edge/Chrome app window,
'  so it behaves like a native Windows app (own taskbar entry,
'  no address bar, no tabs). No install required.
' ============================================================

Option Explicit

Dim fso, sh, base, htmlPath, url, exe, cmd, candidates, i

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh  = CreateObject("WScript.Shell")

base     = fso.GetParentFolderName(WScript.ScriptFullName)
htmlPath = fso.BuildPath(base, "CoreRead.html")

If Not fso.FileExists(htmlPath) Then
  MsgBox "CoreRead.html was not found next to this launcher." & vbCrLf & vbCrLf & _
         "Keep both files in the same folder.", 16, "CoreRead"
  WScript.Quit 1
End If

' file:/// URL - forward slashes, spaces encoded
url = "file:///" & Replace(Replace(htmlPath, "\", "/"), " ", "%20")

' Prefer Edge (always present on Windows 10/11), then Chrome.
candidates = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe") )

exe = ""
For i = 0 To UBound(candidates)
  If fso.FileExists(candidates(i)) Then
    exe = candidates(i)
    Exit For
  End If
Next

If exe = "" Then
  ' No Chromium browser found - fall back to the default .html handler.
  sh.Run Chr(34) & htmlPath & Chr(34), 1, False
Else
  cmd = Chr(34) & exe & Chr(34) & _
        " --app=" & Chr(34) & url & Chr(34) & _
        " --window-size=1360,900"
  sh.Run cmd, 1, False
End If
