Group Policy
============

BGInfo
------

1. Download BgInfo from here.
2. Do the following in Group Policy Management:

.. image1

3. Edit the BGInfo settings to suit your needs.
4. Save your settings in the same place as bginfo.exe.

.. image2
.. image3
.. image4

5. Add ``C:\bginfo\name.bgi /SILENT /TIMER:0 /NOCLIENTPROMPT`` to the argument field in the shortcut property in Group Policy Management.

Disable Sound
-------------

Under *Computer Configuration*, under *Policies*, under *Administrative Templates*, do the following:

.. image1

Disable UAC
-----------

.. image 1

Lock Computers When Idle
------------------------

.. image 1
.. image 2

Internet Explorer Settings
--------------------------

Favourites for Intranet
^^^^^^^^^^^^^^^^^^^^^^^

Under *Computer Configuration*, under *Preferences*, under *Windows Settings*, under *Shortcuts*, do the following:

.. image:: _images/group-policy-ie-1.png

Homepage
^^^^^^^^

.. image:: _images/group-policy-ie-2.png

Trusted Sites Zone
^^^^^^^^^^^^^^^^^^

.. image:: _images/group-policy-ie-3.png

License Server - Point TS to License Server
-------------------------------------------

Under *Computer Configuration*, under *Policies*, under *Administrative Templates*, do the following:

.. image:: _images/group-policy-point-ts-to-license-server.png

Mapped Drives
-------------

Under *User Configuration*, under *Preferences*, under *Windows Settings*, under *Drive Maps*, do the following:

.. image:: _images/group-policy-mapped-drives.png

Remote Assistance
-----------------

Under *Computer Configuration*, under *Policies*, under *Administrative Templates*, do the following:

.. image:: _images/group-policy-remote-assistance.png

WSUS
----

Under *Computer Configuration*, under *Policies*, under *Administrative Templates*, do the following:

.. image:: _images/group-policy-wsus.png
