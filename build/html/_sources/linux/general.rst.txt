#######
General
#######

General, random and useful Linux-related config and things.

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
  #SHA256:tWYkCIAAXO+K/uiFyF3mHVtj84LlirWsvPuS2gfD5Ig ubuntu@CALEBDESKTOP

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

Tar to CIFS
-----------

A good source for ``tar`` commands https://www.freecodecamp.org/news/tar-in-linux-example-tar-gz-tar-file-and-tar-directory-and-tar-compress-commands/.

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
