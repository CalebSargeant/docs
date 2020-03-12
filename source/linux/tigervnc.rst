

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
