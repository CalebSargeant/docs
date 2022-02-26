Host Setup
##########

Developer tools in Chrome:

* **Network** tab shows all api calls for webpage
* **Console** shows error messages

Mac
---

List of Stuff
^^^^^^^^^^^^^

List of stuff to install on a (new) Mac:

.. code-block:: bash

  ## New Mac Setup
  # Install Homebrew (https://brew.sh/)
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"

  # install git
  brew install git

  # install ansible
  brew install ansible

  # coreutils
  brew install coreutils

  # install python requests for API calls
  pip3 install requirements

  # install powershell (pwsh)
  brew cask install powershell

  # install powershell language for atom
  apm install language-powershell

  # Install Powershell beautifier
  pwsh
  Install-Module -Name PowerShell-Beautifier
  # modifying file - Edit-DTWBeautifyScript C:\temp\MyFile.ps1

  # install atom beautify
  apm install beautify

  # install atom compare-files
  apm install compare-files

  # install atom file-icons
  apm install --production file-icons

  # Install atom minimap
  apm install minimap

  # Install atom minimap auto-hider
  apm install minimap-autohider

  # Install nmap
  brew install nmap

  # Install pandoc (https://pandoc.org/) - usage ex. pandoc -t markdown -o output.md ~/input.docx
  brew install pandoc

  # Install virtualenv
  pip3 install virtualenv

  # Install webp to convert webp to png (for i in `ls | grep webp | cut -f 1 -d '.'`; do dwebp "$i.webp" -o "$i.png"; done)
  brew install webp

  # Openstack (https://docs.openstack.org/newton/user-guide/common/cli-install-openstack-command-line-clients.html)
  pip3 install python-openstackclient

  # Install qemu
  brew install qemu

  # Jinja2 template syntax highlighting
  apm install atom-jinja2

  # Install tabula extractor to extract tables out pdfs
  brew cask install tabula

  # Install jq
  brew install jq

  # Install Azure CLI
  brew update && brew install azure-cli

  # Install AWS CLI v2
  curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
  sudo installer -pkg AWSCLIV2.pkg -target /

  # Install terraform
  brew install terraform

  # Install groovy language for Jenkins
  apm install language-groovy

  # Install atom language terraform
  apm install language-terraform

  # Install VSCODE
  brew install visual-studio-code

  # Install go
  brew install go

  # Install Google Cloud SDK Tools
  # https://stackoverflow.com/questions/46144267/bash-gcloud-command-not-found-on-mac
  brew install --cask google-cloud-sdk
  source "$(brew --prefix)/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/path.zsh.inc"
  source "$(brew --prefix)/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/completion.zsh.inc"
  gcloud config set app/cloud_build_timeout 4000

  ## Powershell Modules
  # PowerCLI for VMWARE
  Install-Module -Name VMware.PowerCLI -Scope CurrentUser


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

Undo Last Commit
^^^^^^^^^^^^^^^^

https://devconnected.com/how-to-undo-last-git-commit/#:~:text=The%20easiest%20way%20to%20undo,removed%20from%20your%20Git%20history.

.. code-block:: bash

  git reset --soft HEAD~1

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

Storing Credentials
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # https://stackoverflow.com/questions/35942754/how-can-i-save-username-and-password-in-git
  git config --global credential.helper store
  git pull
  # stored in ~/.git-credentials (insecure, but useful)
