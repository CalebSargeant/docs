#######
General
#######

Check which DC authenticated with: ``echo %logonserver%``

Download Firefox from CLI
-------------------------

.. code-block:: powershell

  # In PowerShell:
  wget -O FirefoxSetup.exe "https://download.mozilla.org/?product=firefox-latest&os=win64&lang=en-US"

Operations Masters
------------------

Forest
^^^^^^

Domain Naming
Schema

Domain
^^^^^^

Relative Identifier (RID)
Infrastructure
PDC Emulater

PowerShell
----------

Set-ExecutionPolicy Unrestricted
Will allow unsigned powershell scripts to run.
Set-ExecutionPolicy Restricted
Will not allow unsigned powershell scripts to run.
Set-ExecutionPolicy RemoteSigned
Will allow only remotely signed powershell scripts to run.

Rename Domain Controller
------------------------

netdom computername <CurrentComputerName> /add:<NewComputerName>
netdom computername <CurrentComputerName> /makeprimary:<NewComputerName>
REBOOT
netdom computername <NewComputerName> /remove:<OldComputerName>
