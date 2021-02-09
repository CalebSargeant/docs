Ubiquiti UniFi
==============

It's a pretty self-explanatory system, but anyway, here's some stuff on it.

Access Point
------------

L3 Adopting SSH
^^^^^^^^^^^^^^^

For the Ubiquity white page, please see: https://help.ubnt.com/hc/en-us/articles/204909754-UniFi-Device-Adoption-Methods-for-Remote-UniFi-Controllers

1. Make sure the AP is running the same firmware as the controller. If it is not, see this guide: `Changing UniFi firmware via SSH <http://community.ubnt.com/t5/UniFi-Troubleshooting/UniFi-Upgrading-firmware-image-via-SSH/ta-p/944337>`_. This is not required for minor version differences.

2. Make sure the AP is in factory default state if it's not, do: ```syswrapper.sh restore-default```

3. SSH into the device and type the following: ```set-inform http://unifi.example.com:8080/inform```

4. The AP will now show up for adoption. Click adopt and the device will go offline.

5. Once the device goes offline, repeat step 3. The device will save the inform URL and will start provisioning.

Cisco Switchport Config
^^^^^^^^^^^^^^^^^^^^^^^

Below shows UAP config for switchport, where 10 is the VLAN the AP natively lives in, 20 & 30 being WLANs.

.. code-block:: none

  interface GigabitEthernet0/5
  description UAP
  switchport trunk encapsulation dot1q
  switchport trunk native vlan 10
  switchport trunk allowed vlan 10,20,30
  switchport mode trunk

Controller
----------

Installation
^^^^^^^^^^^^

Refer to this guide: https://help.ubnt.com/hc/en-us/articles/220066768-UniFi-How-to-Install-Update-via-APT-on-Debian-or-Ubuntu

Backups
^^^^^^^

**Manual Backups**

To manually backup the controller, go to *Settings > Maintenance > Backup*. Set the *Backup Data Retention* and click on *Download Backup*. Manually copy the backup to <LOCATION>.

**Auto Backups**

.. image:: _images/unifi-backup-1.png

Restoring
^^^^^^^^^
To restore the controller from a file, go to *Settings > Maintenance > Restore*. Click on *Choose File* and select the file to restore.

Windows Credential Recovery
^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Open Ubiquiti UniFi Controller.
2. Download mongoDB. https://www.mongodb.com/download-center
3. Open CMD
4. ``cd %userprofile%\downloads\mongo..\bin``
5. ``/mongo --port 27117``
6. ``use ace``
7. ``db.admin.find()``

The username and password will be at the bottom
