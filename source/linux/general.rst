#######
General
#######

General, random and useful Linux-related config and things.

A good site to browse random commands and things: https://www.commandlinefu.com/

Dig
---

A & CNAME: ``dig @dnsserver.example.com +short domain.com``
NS: ``dig @dnsserver.example.com +short NS domain.com``
MX: ``dig @dnsserver.example.com +short MX domain.com``
PTR: ``dig @dnsserver.example.com +short -x 10.11.12.13``

Public IP
^^^^^^^^^

Use ``208.67.222.222`` instead of resolver1 if no DNS.
``dig +short myip.opendns.com @resolver1.opendns.com``

Change Hostname
---------------

.. code-block:: bash

  sudo hostnamectl set-hostname <newhostname>
  sudo nano /etc/hosts

Netplan
-------

Static vs dynamic IP Address configuration.

``sudo nano /etc/netplan``

.. code-block:: yaml

  # DYNAMIC (defaults)
  network:
      version: 2
      ethernets:
          eth0:
              dhcp4: true
              match:
                  macaddress: xx:xx:xx:xx:xx:xx
              set-name: eth0

  # STATIC
  network:
      ethernets:
          eth0:
              addresses:
              - 10.0.2.3/24
              gateway4: 10.0.2.1
              nameservers:
                  addresses:
                  - 10.0.2.1
                  search:
                  - example.com
      version: 2

iostat
------

.. code-block:: bash

  sudo apt-get install sysstat
  iostat -d 2 /dev/sda

Netcat
------

.. code-block:: bash

  # Check RADIUS UDP 1812 Port Status
  nc -vnzu 10.11.12.13 1812


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

Mount
-----

.. code-block:: bash

  # install cifs-utils
  apt-get install cifs-utils

  # /etc/fstab
  //server/data /mnt/data cifs credentials=/root/.smbcredentials,vers=1.0,iocharset=utf8,sec=ntlm 0 0

  mount -a

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

File System Check Loop
----------------------

You start up CentOS and it wants to do a File System check. You do the check, reboot and it happens again.
Try the following:

#. Put a CentOS disk into the DVD-Rom
#. Start Rescue Mode
#. Type the following commands:

.. code-block:: bash

  chroot /mnt/sysimage
  badblocks -sv /dev/sdax -o <file_name_here>
  e2fsck -t ext3 -l <file_name_here> /dev/sdax
  vi /etc/fstab
    comment out /dev/sdax before booting the server again

Formatting USB Flash Drive
--------------------------

* vFAT (FAT32): ``mkfs.vfat``
* NTFS: ``mkfs.ntfs``
* EXT4: ``mkfs.ext4``

.. code-block:: bash

  # Format
  mkfs.ext4 -L CALEB /dev/sdx

  # Show information about the USB flash
  parted /dev/sdx print

  # Mound the flash
  mount -t ext4 /dev/sdx1 /mnt/CALEB

Repairing Grub
--------------

You boot up Linux machine (CentOS) and only "grub _" displays on the screen. You can try:

#. Boot from Linux live CD/USB
#. Start in Rescue Mode
#. Run commands

.. code-block:: bash

  chroot /mnt/sysimage
  sbin/grub-install
  mount
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
