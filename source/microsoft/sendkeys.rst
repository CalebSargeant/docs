

Most keys can be represented by the character of the key itself.
E.g, the key sequence FRED can be represented simply by "FRED".
Some special keys, such as the control keys, function keys etc are encoded in a string enclosed by {braces}
See the table below


## TABLE
Key SendKey Equivalent Description
~ {~} send a tilde (~)
! {!} send an exclamation point (!)
^ {^} send a caret (^)
+ {+} send a plus sign (+)
Alt {ALT} send an Alt keystroke
Backspace {BACKSPACE} send a Backspace keystroke
Clear {CLEAR} Clear the field
Delete {DELETE} send a Delete keystroke
Down Arrow {DOWN} send a Down Arrow keystroke
End {END} send an End keystroke
Enter {ENTER} send an Enter keystroke
Escape {ESCAPE} send an Esc keystroke
F1 through F16 {F1} through {F16} send the appropriate Function key
Page Down {PGDN} send a Page Down keystroke
Space {SPACE} send a Spacebar keystroke
Tab {TAB} send a Tab keystroke
## END TABLE

To specify keys combined with any combination of SHIFT, CTRL, and ALT keys, precede the key code with one
or more of the following:

  For SHIFT prefix with +
  For CTRL prefix with ^
  For ALT prefix with %

Example
' Open notepad
Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.Run "notepad", 9
' Give Notepad time to load
WScript.Sleep 500
'type in Hello World
WshShell.SendKeys "Hello World!"
WshShell.SendKeys "{ENTER}"
