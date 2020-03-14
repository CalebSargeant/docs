##########
Virtualenv
##########

.. code-block:: bash

  # Install virtualenv and create folder for python environments
  pip3 install virtualenv
  mkdir ~/virtualenv
  cd ~/virtualenv

  # Create Virtual Environment
  virtualenv -p python3 sphinx

  # Go Into Environment
  source ~/virtualenv/sphinx/bin/activate

  # Change to repo dir
  cd ~/repos/docs

  # Install all packages we need
  pip install -r requirements.txt

  # Get out of the virtual environment
  deactivate
