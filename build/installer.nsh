; Extra Start-menu / desktop shortcuts so Pingo can be started and stopped
; without touching the tray. "Stop Pingo" runs Pingo.exe --quit, which tells
; the running instance to close.

!macro customInstall
  CreateShortCut "$SMPROGRAMS\Stop Pingo.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--quit" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  CreateShortCut "$DESKTOP\Stop Pingo.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--quit" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Stop Pingo.lnk"
  Delete "$DESKTOP\Stop Pingo.lnk"
!macroend
