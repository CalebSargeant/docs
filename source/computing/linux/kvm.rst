KVM
===

https://wiki.debian.org/KVM

https://linuxconfig.org/how-to-create-and-manage-kvm-virtual-machines-from-cli

https://forums.linuxmint.com/viewtopic.php?t=227510

.. code-block:: bash

  # Install dependancies, virtmanager, etc.
  apt-get install --no-install-recommends qemu-system libvirt-clients libvirt-daemon-system virtinst qemu-utils libosinfo-bin

  # To get a list of IDs for --os-variant:
  osinfo-query os

  # Install the VM
  virt-install --name=windows10 --vcpus=2 --memory=4096 --cdrom=/media/data/share/Software/ISO/Win10_2004_English_x64.iso --disk size=32 --os-variant=win10

https://levelup.gitconnected.com/how-to-setup-bridge-networking-with-kvm-on-ubuntu-20-04-9c560b3e3991

https://johnsiu.com/blog/macos-kvm-remote-connect/#install-virt-manager-and-virt-viewer

.. code-block:: bash

  # Create default.xml to define network settings. We want bridged mode to ensure VM gets its own IP.
  nano ~/default.xml
    <network>
      <name>default</name>
      <uuid>c9f4a06b-1ddb-4057-8eda-858955e205c8</uuid>
      <forward mode="bridge"/>
      <bridge name="br0"/>
    </network>

  # Example netplan config BEFORE
  cat 00-installer-config.yaml
    network:
      ethernets:
        enp4s0:
          addresses:
          - 192.168.32.32/24
          gateway4: 192.168.32.1
          nameservers:
            addresses:
            - 1.1.1.1
            - 1.0.0.1
            search:
            - mydomain.com
      version: 2

    # Example netplan config AFTER
    cat /etc/netplan/00-installer-config.yaml
      network:
        ethernets:
          enp4s0:
            dhcp4: false
            dhcp6: false
        bridges:
          br0:
            interfaces: [ enp4s0 ]
            addresses:
            - 192.168.32.32/24
            gateway4: 192.168.32.1
            nameservers:
              addresses:
              - 1.1.1.1
              - 1.0.0.1
            parameters:
              stp: true
              forward-delay: 4
            dhcp4: no
            dhcp6: no
        version: 2

Okay then a couple of things:

  .. code-block:: bash

    # Modify windows10 domain settings to change to vnc & port
    virsh edit windows10
      <graphics type='vnc' port='5950' autoport='no' listen='0.0.0.0'>
        <listen type='address' address='0.0.0.0'/>
      </graphics>
      # Boot device must be changed to cdrom:
      <os>
        <type arch='x86_64' machine='pc-q35-4.2'>hvm</type>
        <boot dev='cdrom'/>
      </os>

    # Then destroy (stop) VM and start again (reboot wont apply setting change)
    virsh destroy windows10
    virsh start windows10

    # Then INSTALL Windows

    # then:
    virsh edit windows10
      change back to hd
      <os>
        <type arch='x86_64' machine='pc-q35-4.2'>hvm</type>
        <boot dev='hd'/>
      </os>

    # Then destroy (stop) VM and start again (reboot wont apply setting change)
    virsh destroy windows10
    virsh start windows10

    # Output of this needs to show 0.0.0.0:5950 (nice hat) to show that its listening on all interfaces
    netstat -tulpn | grep 59
      tcp        0      0 0.0.0.0:5950            0.0.0.0:*               LISTEN      26523/qemu-system-x
      #redacted

    #but it will actually ask you to boot from cd-dvd so not to actually worry about changing it - it will make it a few seconds faster to boot though, so change it after install complete

You may need to add a rule through iptables, or just disable it (NO DONT - BAD IDEA!!!) https://serverfault.com/questions/129086/how-to-start-stop-iptables-on-ubuntu

Autostart settings:

.. code-block:: bash

  virsh autostart windows10
  virsh autostart windows10 --disable

Location of images:

.. code-block:: bash

  /var/lib/libvirt/images/windows10.qcow2
