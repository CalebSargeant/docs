#########
Switching
#########

Health
------

Sh proc cpu sorted | ex 0.00

Factory Default Settings
------------------------

Hold down the mode button
Plug in console cable
Commands:
switch: flash_init
switch: dir flash:
switch: del flash:config.text
del flash:vlan.dat
boot

IOS Upgrade
-----------

Setup a TFTP server
!commands
!!backup config
Copy run start
!!backup config to server
Copy startup-config tftp:
!!copy the .bin file downloaded to flash
Copy tftp flash:
!!verify the .bin file
Verify flash:xxxx.bin
!!specify to boot off of the new .bin file
Boot system flash:xxxxxxx.bin
reload
