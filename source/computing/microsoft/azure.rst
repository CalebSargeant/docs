Azure
=====

Resize Disk
-----------

https://docs.microsoft.com/en-us/azure/virtual-machines/linux/expand-disks

.. code-block:: bash

  # Get a list of disks in RSG
  az disk list -g RSG --query '[*].{Name:name,Gb:diskSizeGb,Tier:accountType}' --output table

  # Output the name of the disk
  az disk list -g RSG --query '[*].{Name:name,Gb:diskSizeGb,Tier:accountType}' --output table | grep SERVERNAME | awk '{print $1}'

  # Stop the VM
  az vm stop -g RSG -n SERVERNAME

  # Deallocate the VM
  az vm deallocate -g RSG -n SERVERNAME

  # Resize the disk
  az disk update -g UK-RSG -n SERVERNAME_OsDisk_1_4a12a4e9e76a4acb802a20815eb18d37 --size-gb 100

  # Start the VM
  az vm start -g RSG -n SERVERNAME
