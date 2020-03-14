#######
General
#######

General, random and useful Linux-related config and things.

A good site to browse random commands and things: https://www.commandlinefu.com/

Screen
------

.. code-block:: bash

  # Create screen called caleb
  screen -S caleb

  # Go into screen called caleb
  screen -r -d caleb

Generating SSH Keys
-------------------

.. code-block:: bash

  # Generate a public key on the client
  ssh-keygen -t rsa -b 4096

  ### Output
  #Generating public/private rsa key pair.
  #Enter file in which to save the key (/home/ubuntu/.ssh/id_rsa):
  #Enter passphrase (empty for no passphrase):
  #Enter same passphrase again:
  #Your identification has been saved in /home/ubuntu/.ssh/id_rsa.
  #Your public key has been saved in /home/ubuntu/.ssh/id_rsa.pub.
  #The key fingerprint is:
  #SHA256:random

  # Copy public key to server (you will be required to authenticate)
  ssh-copy-id ubuntu@10.0.2.12

  ### Output
  # /usr/bin/ssh-copy-id: INFO: Source of key(s) to be installed: "/home/ubuntu/.ssh/id_rsa.pub"
  # /usr/bin/ssh-copy-id: INFO: attempting to log in with the new key(s), to filter out any that are already installed
  # /usr/bin/ssh-copy-id: INFO: 1 key(s) remain to be installed if you are prompted now it is to install the new keys
  # ubuntu@10.0.2.12's password:

  # Number of key(s) added: 1

  # Now try logging into the machine, with:   "ssh 'ubuntu@10.0.2.12'"
  # and check to make sure that only the key(s) you wanted were added.


Sudo without Password
---------------------

.. code-block:: bash

  # DO NOT MAKE A MISTAKE
  visudo
      %sudo   ALL=(ALL:ALL) NOPASSWD:ALL

Compression
-----------

Zip
^^^

.. code-block:: bash

  yum -y install zip unzip
  zip -9 -r <zip file> <folder name>
  unzip file.zip

Bunzip
^^^^^^

.. code-block:: bash

  bunzip2 myfile.bz2
  tar xjvf myfile.tar.bz2

Tar
^^^

A good source for ``tar`` commands https://www.freecodecamp.org/news/tar-in-linux-example-tar-gz-tar-file-and-tar-directory-and-tar-compress-commands/.

**.tar:**

.. code-block:: bash

  tar -cvf myarchive.tar mydirectory/
  tar -xvf mystuff.tar

**.tar.gz**

.. code-block:: bash

  tar -czvf myarchive.tgz mydirectory/
  tar -xzvf mystuff.tgz

**Tar to CIFS:**

.. code-block:: bash

  # Backup the MySQL database
  mysqldump zabbix > backup.sql

  # Install cifs-utils
  apt-get install cifs-utils

  # Create mountpoint dir
  mkdir /mnt/data

  # Mount the share
  mount -t cifs //10.10.10.10/share /mnt/data -o user=administrator

  # Archive Zabbix config & DB
  tar cfzv backup.tar.gz /etc/zabbix/ backup.sql

  # Copy to share
  cp backup.tar.gz /mnt/data/

PDF to CSV
----------

https://github.com/tabulapdf/tabula-java/releases

.. code-block:: bash

  TABULARNAME=tabula-1.0.3-jar-with-dependencies.jar
  YEAR=2019
  MONTH=08
  java -jar ./$TABULARNAME -b ./$YEAR/$MONTH -t -p all

Ubuntu 16 - Change IP & Hostname
--------------------------------

**Static IP**

.. code-block:: bash

  cd /etc/sysconfig/network-scripts/
  vi ifcfg-eth0
    DEVICE=eth0
    BOOTPROTO=none
    ONBOOT=yes
    NETMASK=xxx.xxx.xxx.xxx
    IPADDR=xxx.xxx.xxx.xxx
    TYPE=Ethernet
  vi /etc/sysconfig/network
    NETWORKING=yes
    NETWORKING_IPV6=no
    HOSTNAME=hostname.domainname.co.za
    GATEWAY=xxx.xxx.xxx.xxx

  /etc/init.d/network restart

**Dynamic IP**

``dhclient ethx`` or:

.. code-block:: bash

  cd /etc/sysconfig/network-scripts/
  vi ifcfg-eth0
    DEVICE=eth0
    BOOTPROTO=dhcp
    ONBOOT=yes
    TYPE=Ethernet

  vi /etc/sysconfig/network
    NETWORKING=yes
    NETWORKING_IPV6=no
    HOSTNAME=hostname.domainname.co.za
    GATEWAY=xxx.xxx.xxx.xxx

  /etc/init.d/network restart

**Hostname Change**

.. code-block:: bash

    hostname --fqd
    vi /etc/sysconfig/network
      HOSTNAME=<new_hostname>
    vi /etc/hosts
      <ipaddr_of_server> <new_hostname.domain> <hostname>
    reboot

Installing GUI on CentOS
------------------------

``yum groupinstall "Desktop" "Desktop Platform" "X Window System" "Fonts"``

List Samba Users
----------------

pbdedit -L

Open Webpage on Mac
-------------------

``open -a "Google Chrome" index.html``

Running FSCK Manually
---------------------

You get a message: (or something similar)
/dev/mapper/vg_fedora1530-lv-home: UNEXPECTED INCONSISTENCY: RUN fsck MANUALLY (i.e., without -a or -p options)
Try the following:
1. Type the following commands:
umount /dev/sda*
fsck /dev/sda1 -f -y -a
(see http://www.computerhope.com/unix/fsck.htm for syntax of fsck)

Xen
---

Manually Starting
^^^^^^^^^^^^^^^^^

xm list
cd /etc/xen/
ls
xm create <vm-name>
ping <vm-name>
xm list

Install Xen
^^^^^^^^^^^

yum install xen virt-manager kernel-xen
chkconfig xend on
reboot

Mount CD for Image of OS
^^^^^^^^^^^^^^^^^^^^^^^^

mkdir /media/cdrom
mount -t <name_of_iso> -o ro /dev/cdrom /media/cdrom

Install VM
^^^^^^^^^^
virt-install --prompt (yes centos 512 /home/vm/centos /media/cdrom)

Launch VM to Create Virtual OS
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
startx
virt-manager

NOTE to exit startx press ctrl,alt,bkspce

Skel Terminal Colours
---------------------

Mv .bashrc .bashrc.bak
Cp /etc/skel/.bashrc .bashrc
Nano .bashrc
# uncomment this:
force_color_prompt=yes
# add this to the bottom of the file
[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm"
. .bashrc

Rename a File to a Filename with Date
-------------------------------------
cp <name_of_file> <new_name_of_file>.`date -I`

Checking CPU Architecture
-------------------------
uname -i

Checking Uptime
---------------
uptime

TigerVNC
--------

yum install vnc vnc-server tigervnc-server xterm
yum groupinstall Desktop

useradd <UserNameHere>
passwd <UserNameHere>

vi /etc/sysconfig/vncservers
  VNCSERVERS="1:<user1> 2:<user2> 3:<user3>"
  VNCSERVERARGS[1]="-geometry 640x480"
  VNCSERVERARGS[2]="-geometry 640x480"
  VNCSERVERARGS[3]="-geometry 800x600"

# Remember to delete the nonsense after: <resolution>"

su - <username>
vncpasswd
service vncserver start

# To connect to a Windows machine, install tiger-vnc on the Windows machine and enable Remote Desktop. Allow RDP 3389 through firewall.
