Raspberry Pi
============

All Raspberry Pi-related stuff.

Writing SD Card
---------------

https://www.raspberrypi.org/documentation/installation/installing-images/mac.md

.. code-block:: bash

  # List disks to find SD card disk number (diskN)
  diskutil list

  # Unmount the disk
  diskutil unmountDisk /dev/diskN

  # Write the image to SD card. Check the progress by pressing Ctrl+T.
  sudo dd bs=1m if=/Users/caleb/Downloads/raspberry.img of=/dev/rdiskN; sync

  # Eject the disk afterwards
  sudo diskutil eject /dev/rdiskN

Firmware Update
---------------

https://www.raspberrypi.org/documentation/raspbian/applications/rpi-update.md

https://elinux.org/R-Pi_Troubleshooting#Updating_firmware

.. code-block:: bash

  sudo rpi-update
  sudo reboot

Swap File Size
--------------

https://pimylifeup.com/raspberry-pi-swap-file/

.. code-block:: bash

  sudo dphys-swapfile swapoff
  sudo nano /etc/dphys-swapfile
    CONF_SWAPSIZE=1024
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon

Web Server
----------

https://pimylifeup.com/raspberry-pi-apache/

Apache
^^^^^^

.. code-block:: bash

  sudo apt install apache2 -y
  sudo usermod -a -G www-data pi
  sudo chown -R -f www-data:www-data /var/www/html
  nano /var/www/html/index.html

PHP
^^^

.. code-block:: bash

  sudo apt install php7.4 libapache2-mod-php7.4 php7.4-mbstring php7.4-mysql php7.4-curl php7.4-gd php7.4-zip -y
  sudo nano /var/www/html/example.php
    <?php
    echo "Today's date is ".date('Y-m-d H:i:s');
  sudo nano /etc/apache2/sites-available/example.com.conf
    <VirtualHost *:80>
      ServerName example.com
      ServerAlias www.example.com
      DocumentRoot /var/www/example.com/public_html
      ErrorLog ${APACHE_LOG_DIR}/example.com_error.log
      CustomLog ${APACHE_LOG_DIR}/example.com_access.log combined
    </VirtualHost>
  sudo mkdir -p /var/www/example.com/public_html
  sudo chown -R www-data:www-data /var/www/example.com/public_html
  sudo a2ensite example.com.conf
  sudo systemctl reload apache2

Bluetooth Speaker
-----------------

https://www.raspberrypi.org/forums/viewtopic.php?t=235519

https://stackoverflow.com/questions/26299053/changing-raspberry-pi-bluetooth-device-name

Work in progress... RPI3B audio still skips every once in a while, despite official power adapter.

.. code-block:: bash

  # Install bluetooth & pulseaudio & bluez-tools (for autopairing/trusting)
  sudo apt-get install pulseaudio pulseaudio-module-bluetooth bluez-tools

  # Fix audio before you even get problems https://askubuntu.com/questions/707171/how-can-i-fix-choppy-audio (still getting audio jumps over bluetooth)
  /etc/pulse/default.pa
    load-module module-udev-detect
    load-module module-udev-detect tsched=0
    pulseaudio -k

  # Add user to bluetooth group & reboot
  sudo usermod -a -G bluetooth pi

  # Make pi discoverable as an A2DP Sink
  sudo nano /etc/bluetooth/main.conf
    ...
    Class = 0x41C
    ...
    DiscoverableTimeout = 0
    ...
  sudo systemctl restart bluetooth

  # Run & config bluetoothctl (can also be used to troubleshoot connections - just run bluetoothctl and connect device)
  bluetoothctl
    power on
    discoverable on
    pairable on
    agent on
    default-agent
    system-alias 'Your New BT Alias'
    quit

  # Start & enable pulseaudio (as pi user)
  pulesaudio --start
  sudo systemctl status bluetooth
  systemctl --user enable pulseaudio

  # Enable autologin as pi user
  sudo raspi-config
    3 Boot Options
    B1 Desktop / CLI
    B2 Console Autologin
  sudo reboot now

  # Configure bluez-tools
  sudo nano /etc/systemd/system/bt-agent.service
    [Unit]
    Description=Bluetooth Auth Agent After=bluetooth.service PartOf=bluetooth.service
    [Service]
    Type=simple
    ExecStart=/usr/bin/bt-agent -c NoInputNoOutput
    [Install] WantedBy=bluetooth.target

  # Start & Enable bt-agent
  sudo systemctl enable bt-agent
  sudo systemctl start bt-agent
  sudo systemctl status bt-agent

  # OPTIONAL: Adding a PIN
  sudo nano /etc/bluetooth/pin.conf
    * 123456
  sudo chmod 600 /etc/bluetooth/pin.conf
  sudo nano /etc/systemd/system/bt-agent.service
    [Unit]
    Description=Bluetooth Auth Agent After=bluetooth.service PartOf=bluetooth.service

    [Service]
    Type=simple
    ExecStart=/usr/bin/bt-agent -c NoInputNoOutput -p /etc/bluetooth/pin.conf ExecStartPost=/bin/sleep 1
    ExecStartPost=/bin/hciconfig hci0 sspmode 0

    [Install] WantedBy=bluetooth.target
  sudo systemctl daemon-reload
  sudo systemctl restart bt-agent
  sudo systemctl status bt-agent

  # OPTIONAL: Use USB bluetooth dongle (disable onboard)
  sudo nano /etc/modprobe.d/blacklist-bluetooth.conf
    blacklist btbcm
    blacklist hci_uart
  sudo reboot

Audio Config
^^^^^^^^^^^^

Adjusting Volume:

https://my.esecuredata.com/index.php?/knowledgebase/article/6/adjust-the-volume-of-a-raspberry-pi-using-the-command-line

``alsamixer``

Change Audio Output Device:

https://www.raspberrypi.org/documentation/configuration/audio-config.md

``sudo raspi-config`` > Advanced Options > Audio

Spotify Connect
^^^^^^^^^^^^^^^

https://pimylifeup.com/raspberry-pi-spotify/

.. code-block:: bash

  # Install dependancies
  sudo apt install -y apt-transport-https curl

  # Add raspotify GPG key & repo
  curl -sSL https://dtcooper.github.io/raspotify/key.asc | sudo apt-key add -v -
  echo 'deb https://dtcooper.github.io/raspotify raspotify main' | sudo tee /etc/apt/sources.list.d/raspotify.list

  # Install raspotify
  sudo apt update
  sudo apt install raspotify

  # Changing name of device - leave "OPTIONS" alone if you don't want to tie to internet account and have it work over just the LAN (same L2 broadcast domain)
  sudo nano /etc/default/raspotify
    DEVICE_NAME="raspotify"
    BITRATE="160"
    OPTIONS="--username <USERNAME> --password <PASSWORD>"

  # Restart raspotify after making changes
  sudo systemctl restart raspotify

Fixing Audio
^^^^^^^^^^^^

Attempts to fix the audio jumps:

https://wiki.archlinux.org/index.php/PulseAudio/Troubleshooting#Sound_stuttering_when_streaming_over_network

https://raspberrypi.stackexchange.com/questions/9795/pulseaudio-sink-stuttering

https://dbader.org/blog/crackle-free-audio-on-the-raspberry-pi-with-mpd-and-pulseaudio

https://raspberrypi.stackexchange.com/questions/32356/how-do-i-fix-cracking-sounds
