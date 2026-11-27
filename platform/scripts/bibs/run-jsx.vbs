Dim ai
Set ai = CreateObject("Illustrator.Application")
ai.DoJavaScriptFile CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(WScript.Arguments(0))
