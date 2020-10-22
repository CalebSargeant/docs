General
=======

Public Key Authentication
-------------------------

https://en.wikiversity.org/wiki/Cisco_IOS/Configure_public_RSA_key_authentication

.. code-block:: bash

  # Generate RSA key on your client machine, laptop, or whatever
  ssh-keygen

  # Fold the key to format it for Cisco to understand
  fold -b -w 72 ~/.ssh/id_rsa.pub

.. code-block:: none

  ROUTER# conf t
  ROUTER(config)#ip ssh pubkey-chain
  ROUTER(conf-ssh-pubkey)#username USERNAME
  ROUTER(conf-ssh-pubkey-user)#key-string
  ROUTER(conf-ssh-pubkey-data)#THE_FOLD_OUTPUT
  ROUTER(conf-ssh-pubkey-data)#exit
  ROUTER(conf-ssh-pubkey-user)#exi
  ROUTER(conf-ssh-pubkey)#exi
  ROUTER(config)#do wr
