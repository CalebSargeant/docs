#######
General
#######

General, random and useful Linux-related config and things.

A good site to browse random commands and things: https://www.commandlinefu.com/

Apt & Yum Cheat Sheets
----------------------

https://blog.packagecloud.io:

:download:`Apt Cheat Sheet <_docs/APT Cheat Sheet - Packagecloud Blog.pdf>`

:download:`Yum Cheat Sheet <_docs/Yum Cheat Sheet - Packagecloud Blog.pdf>`

Rsync
-----

https://ss64.com/bash/rsync.html

https://www.computerhope.com/unix/rsync.htm

.. code-block:: bash

  # rsync without owner and group attributes
  rsync -avP --no-o --no-g /mnt/data/share/ /mnt/server3/Backups/

  # cronning rsync (https://unix.stackexchange.com/questions/392780/how-to-schedule-an-rsync-command)
  crontab -e
    0 19 * * * root rsync -a src dest

  # rsync showing progress (https://www.cyberciti.biz/faq/show-progress-during-file-transfer/)
  rsync -P src dest

  # rsync exclude stuff
  rsync -avP --exclude 'file_or_dir' src/ dst/

  # rsync exclude from source file list
  cat excl-list.txt
    thisdir
    thatdir
    myfile.txt
  rsync -av --exclude-from={excl-list.txt}

  # stop rsync from bandwidth vreet (https://www.cyberciti.biz/faq/how-to-set-keep-rsync-from-using-all-your-bandwidth-on-linux-unix/)
  rsync -avP --bwlimit=KBps
  rsync -avP --bwlimit=1024 src/ dst/

  # rsync specify multiple source dirs (https://unix.stackexchange.com/questions/368210/how-to-rsync-multiple-source-folders)
  rsync -avP /src/one /src/two /src/etcetra /dst

Fstab
-----

Emergency Mode Bad Fstab
^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # Put SD card / HDD into another PC
  nano /boot/cmdline.txt
    init=/bin/sh

  # Put SD card / HDD back into original machine

  # Mount FS (but not fstab)
  mount -o remount,rw / –target /

  # Modify fstab
  nano /etc/fstab
    # modify what must be

  # Put SD card / HDD into another PC
  nano /boot/cmdline.txt
    # delete init=/bin/sh

  # Put SD card / HDD back into original machine

SSH Config
----------

https://www.ssh.com/ssh/config/

https://www.openssh.com/legacy.html

Example:

.. code-block:: bash

  cat ~/.ssh/config
    Host server
     LocalForward 2222 192.168.99.99:22
     User ubuntu
     Hostname 192.168.100.1
     IdentityFile ~/.ssh/server
    Host router
     User cisco
     Hostname 192.168.1.1
     IdentityFile ~/.ssh/router
     Ciphers aes256-cbc
    Host switch
     User cisco
     Hostname 192.168.33.2
     Ciphers aes256-cbc
     KexAlgorithms +diffie-hellman-group1-sha1

Disk Usage
----------

.. code-block:: bash

  # Human readable output
  du -h mydir/

  # Kilobytes
  du -k mydir/

  # Megabytes
  du -m mydir/

  # Which sub-dirs consume how much disk space:
  du -h --max-depth=1 mydir/ | sort -hr

  # List all items including files and dirs
  du -ah mydir/

  # Multiple dirs
  du -h dir1/ dir2/

  # Summary
  du -sh

  # Grand total of dirs
  du -sch dir/

  # Exclude:
  du -sh --exclude='*.docx'

Formatting Disk
---------------

.. code-block:: bash

  # List disks
  df -h
  fdisk -l

  # Unmount disk to format
  sudo umount /dev/sdc1

  # vFAT, NTFS, EXT4, etc.:
  sudo mkfs.vfat /dev/sdc1
  sudo mkfs.ntfs /dev/sdc1
  sudo mkfs.ext4 /dev/sdc1

ISO to Disk
-----------

.. code-block:: bash

  sudo dd if=~/Downloads/ubuntu_something.iso of=/dev/diskN

Curl
----

Uploading files: https://ec.haxx.se/usingcurl/usingcurl-uploads

.. code-block:: bash

  curl https://EXAMPLE \
    -F 'one=sometext' \
    -F 'two=someothertext' \
    -F 'three=somemoretext' \
    -F 'doc=@/Users/caleb/Documents/Test.docx; type=application/vnd.openxmlformats-officedocument.wordprocessingml.document'

Find
----

https://askubuntu.com/questions/123305/how-to-find-a-folder-on-my-server-with-a-certain-name

.. code-block:: bash

  find ~ -name foldername -type d

Screen
------

.. code-block:: bash

  # Create screen called caleb
  screen -S caleb

  # Go into screen called caleb
  screen -r -d caleb

Generating SSH Keys
-------------------

https://askubuntu.com/questions/311558/ssh-permission-denied-publickey

.. code-block:: bash

  ### ON THE CLIENT

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

  # You can add IdentitiesOnly yes to ensure ssh uses the IdentityFile and no other keyfiles during authentication, which can cause issues and is not a good practice.
  vim ~/.ssh/config
    Host SERVERNAME
    Hostname ip-or-domain-of-server
    User USERNAME
    PubKeyAuthentication yes
    IdentityFile ./path/to/key

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

**.tar**

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

.. code-block:: bash

  xm list
  cd /etc/xen/
  ls
  xm create <vm-name>
  ping <vm-name>
  xm list

Install Xen
^^^^^^^^^^^

.. code-block:: bash

  yum install xen virt-manager kernel-xen
  chkconfig xend on
  reboot

Mount CD for Image of OS
^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  mkdir /media/cdrom
  mount -t <name_of_iso> -o ro /dev/cdrom /media/cdrom

Install VM
^^^^^^^^^^

``virt-install --prompt (yes centos 512 /home/vm/centos /media/cdrom)``

Launch VM to Create Virtual OS
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # NOTE to exit startx press ctrl,alt,bkspce
  startx
  virt-manager

Skel Terminal Colours
---------------------

.. code-block:: bash

  mv .bashrc .bashrc.bak
  cp /etc/skel/.bashrc .bashrc
  nano .bashrc
  # uncomment this:
  force_color_prompt=yes
  # add this to the bottom of the file
  [[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm"
  . .bashrc

Rename a File to a Filename with Date
-------------------------------------

``cp <name_of_file> <new_name_of_file>.`date -I```

Checking CPU Architecture
-------------------------

``uname -i``

Checking Uptime
---------------

``uptime``

TigerVNC
--------

.. code-block:: bash

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

Old School LAMP
---------------

Features
^^^^^^^^

* Apache (hosts the website)
* MySQL (Database server)
* PHP (hypertext processor)
* Joomla (creates the website. Dependant on PHP and MYSQL)

Installation
^^^^^^^^^^^^

**My SQL Server 5.0 (server & client)**

.. code-block:: bash

  yum install mysql mysql-server
  chkconfig --levels 235 mysqld on
  /etc/init.d/mysqld start
  mysql_secure_installation

**Apache 2**

(http://xxx.xxx.xxx)
(Apache's default document root is /var/www/html on CentOS, and the configuration file is /etc/httpd/conf/httpd.conf.
Additional configurations are stored in the /etc/httpd/conf.d/ directory)

.. code-block:: bash

  yum install httpd
  chkconfig --levels 235 httpd on
  /etc/init.d/httpd start

**PHP5**

.. code-block:: bash

  yum install php
  /etc/init.d/httpd restart
  vi /var/www/html/info.php

**MySQL Support for PHP5**

(http://xxx.xxx.xxx.xxx/info.php)

.. code-block:: bash

  yum search php
  yum install php-mysql php-gd php-imap php-ldap php-mbstring php-odbc php-pear php-xml phpxmlrpc
  yum install php-pecl-apc
  /etc/init.d/httpd restart

**phpMyAdmin**

(http://xxx.xxx.xxx.xxx/phpmyadmin/)

.. code-block:: bash

  rpm --import http://dag.wieers.com/rpm/packages/RPM-GPG-KEY.dag.txt

  # 64-bit:
  yum install http://pkgs.repoforge.org/rpmforge-release/rpmforge-release-0.5.2-2.el6.rf.x86_64.rpm

  # 32-bit
  yum install http://pkgs.repoforge.org/rpmforge-release/rpmforge-release-0.5.2-2.el6.rf.i686.rpm

  yum install phpmyadmin
  vi /etc/httpd/conf.d/phpmyadmin.conf
    #
    # Web application to manage MySQL
    #
    #<Directory "/usr/share/phpmyadmin">
    # Order Deny,Allow
    # Deny from all
    # Allow from 127.0.0.1
    #</Directory>
    Alias /phpmyadmin /usr/share/phpmyadmin
    Alias /phpMyAdmin /usr/share/phpmyadmin

  vi /usr/share/phpmyadmin/config.inc.php
    [...]
    /* Authentication type */
    $cfg['Servers'][$i]['auth_type'] = 'http';
    [...]

  /etc/init.d/httpd restart

**Joomla!**

If you are installing LAMP without Joomla then skip all the commands that have anything to do with
Joomla.

.. code-block:: bash

  cd /tmp
  yum install wget
  wget joomlacode.org/gf/download/frsrelease/17715/77262/Joomla_2.5.8-Stable-Full_Package.zip
  mkdir /tmp/joomla
  unzip Joomla_2.5.8-Stable-Full_Package.zip /tmp/joomla/
  mv /tmp/joomla/* /var/www/html/
  service mysqld start; chkconfig mysqld on
  /usr/bin/mysql_secure_installation
  yum --enablerepo=epel install phpmyadmin

  vi /etc/httpd/conf.d/phpMyAdmin.conf
    Allow from 127.0.0.1 xxx.xxx.xxx.xxx/24

  iptables -I INPUT -p tcp --dport http -j ACCEPT ; service iptables save ; service iptables restart

  vi /etc/php.ini
    output_buffering=Off

  touch /var/www/html/configuration.php
  chmod 666 /var/www/html/configuration.php
  service httpd start; chkconfig httpd on

  mysql -u root -p
    create database <db_name_here>
    create user 'root'@'localhost' identified by '<password_here>';
    grant all privileges on <db_name_here>.* to root@localhost;
    show grants for 'root'@'localhost';

Open up a web browser and type in http://xxx.xxx.xxx. Follow the wizard. REMEMBER TO COPY
CONFIGURATION TEXT TO /var/www/html/configuration.php.
``rm -rf /var/www/html/installation/``
You can access the server by going to a browser and typing http://xxx.xxx.xxx/administrator.

Git Server
----------

On the Server
^^^^^^^^^^^^^

**Installing Git**

.. code-block:: bash

  yum install git-core

**Configuring the git group**

.. code-block:: bash

  groupadd git

For a new user:

.. code-block:: bash

  useradd -G git <username>
  passwd <username>
  id <username>

For an existing user:

.. code-block:: bash

  usermod -a -G git <username>
  id <username>

**Configuring the Git Server Repository**

.. code-block:: bash

  mkdir /path/to/gits
  cd /path/to/gits
  mkdir project.git
  cd project.git
  git init --bare --shared=group
  sudo chmod -R g+ws *
  sudo chgrp -R git *

**Configuring the Git Hook for Web code**

.. code-block:: bash

  mkdir /var/www/html/project
  cd /path/to/gits/project.git
  vi /hooks/post-recieve
  #!/bin/sh
  GIT_WORK_TREEE=/var/www/html/project git checkout -f
  chmod +x hooks/post-receive
  chown -R git:git *

On the Client's Machine
^^^^^^^^^^^^^^^^^^^^^^^

Download and install: https://git-scm.com/download/win

.. code-block:: bash

  mkdir /path/to/gits
  cd /path/to/gits
  mkdir project.git
  cd project.git
  git init
  git remote add web ssh://<HostnameOrIP>/full/path/to/project.git
  git add README
  git commit -m "Initial Import"
  git push web +master:refs/heads/master

Then open Firefox, go to <HostnameOrIP>/project
Then in future: git push web

Please note that you wont see any files on the server, because it is a bare repository and therefore the files are
protected. You can create a Git Hook to expose the bare repository's files in a different directory (useful for
web code).
Use git clone ssh://<hostname>/path/to/gits to clone an existing server repository.

Age of System
-------------

https://serverfault.com/questions/221377/how-to-determine-the-age-of-a-linux-system-since-installation

.. code-block:: bash

  ubuntu@server:~$ sudo tune2fs -l /dev/sda2 | grep created
  Filesystem created:       Mon Sep  7 06:49:22 2020

Temporary Failure in Name Resolution
------------------------------------

https://stackoverflow.com/questions/53687051/ping-google-com-temporary-failure-in-name-resolution

.. code-block:: bash

  sudo systemctl disable systemd-resolved.service
  sudo systemctl stop systemd-resolved.service
  sudo rm /etc/resolv.conf
  echo "nameserver 1.1.1.1" > /etc/resolv.conf
  echo "nameserver 1.0.0.3" >> /etc/resolv.conf

Change Hosname
--------------

https://www.cyberciti.biz/faq/ubuntu-20-04-lts-change-hostname-permanently/

.. code-block:: bash

  sudo hostnamectl set-hostname SERVERNAME
  nano /etc/hosts
