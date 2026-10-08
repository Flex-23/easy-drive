' Easy Drive — starts the print agent with no window at all.
'
' This is what Windows runs at logon. Starting start-print.bat directly would
' leave a console window on the till's screen for as long as it runs, and sooner
' or later somebody closes it and the receipts stop. The third argument to Run
' (0) means hidden, and False means do not wait for it to finish.
'
' Nothing is lost by hiding it: everything the agent would have written to the
' screen also goes to agent.log beside this file. To watch it live instead, run
' start-print.bat by hand.

Dim shell, here
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = here
shell.Run """" & here & "\start-print.bat""", 0, False
