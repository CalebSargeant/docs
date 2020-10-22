##########
Host Setup
##########

Developer tools in Chrome:

* **Network** tab shows all api calls for webpage
* **Console** shows error messages

Mac
---

Updating Bash
^^^^^^^^^^^^^

.. code-block:: bash

  # https://apple.stackexchange.com/questions/193411/update-bash-to-version-4-0-on-osx
  brew install bash
  sudo bash -c 'echo /usr/local/bin/bash >> /etc/shells'
  chsh -s /usr/local/bin/bash

  # open new terminal window

Windows
-------

PowerShell v6
^^^^^^^^^^^^^

.. code-block:: powershell

  #$version = "6.2.3"
  #$url = "https://github.com/PowerShell/PowerShell/releases/download/v$version/PowerShell-$version-win-x64.msi"
  #$dest = "$ENV:UserProfile\Downloads\PowerShell-6.2.3-win-x64.msi"

  #Invoke-WebRequest -Uri $url -OutFile $dest
  #msiexec.exe /package PowerShell-$version-win-x64.msi /quiet ADD_EXPLORER_CONTEXT_MENU_OPENPOWERSHELL=1 ENABLE_PSREMOTING=1 REGISTER_MANIFEST=1

WSL
^^^

Windows Subsystem for Linux

.. code-block:: powershell

  # Run Powershell as Administrator, run command, reboot
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux

.. code-block:: bash

  # Go to Windows Store, search for Linux, install Ubuntu 18.04 LTS & run it

  # Update & Upgrade
  sudo apt update -y && sudo apt upgrade -y

  # Install pip3
  sudo apt install python3-pip -y

  # Install Ansible
  #pip3 install ansible

  # I had to install ansible through apt
  sudo apt install ansible -y

  # Running a playbook
  cd /mnt/d/repos/personal/ansible
  ansible-playbook -i ./hosts.yml playbookname.yml

Git
---

Configuration
^^^^^^^^^^^^^

.. code-block:: bash

  nano ~/repos/reponame/.git/config

  [core]
    sshCommand = ssh -i /Users/caleb.sargeant/.ssh/github

  [user]
    name = Caleb Sargeant
    email = 4991715+CalebSargeant@users.noreply.github.com

Cloning
^^^^^^^

https://stackoverflow.com/questions/41714882/git-how-to-clone-with-ssh-key-username

.. code-block:: bash

  git clone git@provider.com:userName/projectName.git --config core.sshCommand="ssh -i ~/.ssh/github"
