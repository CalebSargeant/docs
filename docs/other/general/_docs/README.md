# Main Title

We are doing this and that with this repo

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

#### On Mac:

[Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli-macos?view=azure-cli-latest), [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/intro_installation.html#latest-releases-via-pip), and [Bash 4.0+](https://apple.stackexchange.com/questions/193411/update-bash-to-version-4-0-on-osx) are required to run the scripts in this project. You are also required to [sign into Azure through the CLI](https://docs.microsoft.com/en-us/powershell/azure/authenticate-azureps?view=azps-3.0.0#sign-in-interactively) prior to running the scripts.
```
# Azure CLI
brew install azure-cli

# Ansible
pip install ansible

# Bash 4.0+
brew install bash
sudo bash -c 'echo /usr/local/bin/bash >> /etc/shells'
chsh -s /usr/local/bin/bash
```

#### On Ubuntu:

To be documented. If you are running Windows, you need to install Ubuntu subsystem and look at the Ubuntu equivalent to installing Azure CLI and Ansible (Bash 4.0 can be updated or comes with Ubuntu).

## Using this Repo

We assume that you are within the repo, therefore, for example, `cd` into the repo: `cd ~/repos/myrepo/`.

The scripts in this repo allow us to deploy everything we need to Azure. You need to be in the directory to execute the scripts. The scripts are run in order, but have already been run, so there's nothing to deploy. Below is an example of how you would deploy everything to Azure again.

* `. ./myscript <ARGUMENT>` does this and that.
* `./02-AADDS.sh` does this:
* [A link](https://www.google.co.za), which is a form of AD in Azure that allows us to join machines to the domain, etc. We can also [another link](https://www.google.co.za), but we didn't (however we can with `wow.sh`)
* `./script.sh` does this. **DO NOT** run this script like this!
* `./anotherscript.sh` generates scripts (`me.ps1`) to do this.
* After the above scripts have been executed, you will have this.

### More Stuff!

#### RADIUS
* One
* Two
* Three

## Languages / Software Used

* [Bash](https://www.gnu.org/software/bash/) - Scripts are written in bash
* [PowerShell](https://docs.microsoft.com/en-us/powershell/scripting/overview?view=powershell-7) - Unfortunately had to be used to configure Azure tunnels (and create AAADS)
* [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/?view=azure-cli-latest) - Used to deploy "hardware" components to Azure
* [Expect](https://www.nist.gov/services-resources/software/expect) - Used to `ssh-copy-id` without password prompt
* [Ansible](https://www.ansible.com/) - Software service deployment to Azure VMs
* [FreeRADIUS](https://freeradius.org/) - The RADIUS software deployed to Azure VMs for wireless authentication
* [Duo Authentication Proxy](https://duo.com/docs/authproxy-reference) - The "Duo enabled" RADIUS software deployed to Azure VMs for RA VPN & Network Device Management Access
