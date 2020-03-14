Unattended Installations
========================

Brief Instructions on how to create a Windows unattended disk that allow you to:

* Put in the disk
* Boot from disk
* Make some coffee
* Come back and OS is installed

**Important:**

If you make an Unattended disk for 32-bit, and your physical PC where you are installing WAIK on is 64-bit then you
cannot make a disk for 32-bit. You can however use something like Oracle VM Virtualbox and install Windows 32-bit
virtually.

Windows 7 - 10
--------------

1. Install `WAIK: <https://www.microsoft.com/en-us/download/details.aspx?id=5753>`_ (Remember to use the WAIK relevant to your OS version)
2. Copy Windows onto the local harddrive
3. Open *Windows System Image Manager*
4. *File* > *Select Windows Image* > Browse to location of copied OS
5. Select the desired Image
6. Generate the catalog
7. *File* > *New Answer File*
8. Click the plus by Components
9. Follow the below

  * `Windows 7 32-bit`_

10. Save the autounattend.xml file to the root of the copied OS
11. Use ImgBurn to Write a Bootable ISO

  1. Click Advanced > Bootable Disk > Make Image Bootable
  2. Boot Image: \boot\etfsboot.com

Windows 7 32-bit
^^^^^^^^^^^^^^^^

.. image:: _images/windows7x86-unattended-01.png

.. image:: _images/windows7x86-unattended-02.png

.. image:: _images/windows7x86-unattended-03.png

.. image:: _images/windows7x86-unattended-04.png

.. image:: _images/windows7x86-unattended-05.png

.. image:: _images/windows7x86-unattended-06.png

.. image:: _images/windows7x86-unattended-07.png

.. image:: _images/windows7x86-unattended-08.png

.. image:: _images/windows7x86-unattended-09.png

.. image:: _images/windows7x86-unattended-10.png

.. image:: _images/windows7x86-unattended-11.png

.. image:: _images/windows7x86-unattended-12.png

.. image:: _images/windows7x86-unattended-13.png

.. image:: _images/windows7x86-unattended-14.png

.. image:: _images/windows7x86-unattended-15.png

.. image:: _images/windows7x86-unattended-16.png

.. image:: _images/windows7x86-unattended-17.png

.. image:: _images/windows7x86-unattended-18.png

.. image:: _images/windows7x86-unattended-19.png

.. image:: _images/windows7x86-unattended-20.png

.. image:: _images/windows7x86-unattended-21.png

.. image:: _images/windows7x86-unattended-22.png

.. image:: _images/windows7x86-unattended-23.png

.. image:: _images/windows7x86-unattended-24.png

.. image:: _images/windows7x86-unattended-25.png

.. image:: _images/windows7x86-unattended-26.png

.. image:: _images/windows7x86-unattended-27.png

.. image:: _images/windows7x86-unattended-28.png

.. image:: _images/windows7x86-unattended-29.png

.. image:: _images/windows7x86-unattended-30.png

Windows XP
----------

Instructions:

1. Download and install nLite
2. Copy contents of Windows XP Disk to Harddrive
3. Open nLite
4. Locate the copied Windows XP files
5. Integrate updates and drivers if you want
6. At Unattended section

  #. Fully automated
  #. Enabled
  #. XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (please change when activating Windows)
  #. Automatic
  #. Turn off Firewall
  #. Skip OOBE
  #. Turn off Hibernate
  #. System Restore Service Enabled

7. At Users section

  #. Add an account
  #. Username: admin
  #. Password: 1234567
  #. Local Group: Administrators

8. At Owner and Network ID

  #. Computer Name: windowsxp
  #. Workgroup: WORKGROUP
  #. Full Name: Admin
  #. Organization: Organization

9. At Regional section

  #. Language: English (South Africa)
  #. Localization: English (United States)
  #. Keyboard: US
  #. Location: South Africa
  #. Time Zone: (GMT +02{00) Harare, Pretoria

10. At Automatic Updates

  #. Download and notify of installation

11. Tweek the disk if you want
12. Start the Process and close nLite
13. Edit [copied xp location]\I386\winnt.sif

  #. under [Unattended] put: "Repartition = "Yes""
  #. under [Data] put: "AutoPartition = 1"

14. Open nLite again and go straight to Bootable ISO
15. Make a Bootable ISO with nLite
16. Use ImgBurn to write ISO to disk.
