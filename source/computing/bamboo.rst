Bamboo
======

Setting up an Instance
----------------------

.. code-block:: bash

    root@bamboo:~# wget https://www.atlassian.com/software/bamboo/downloads/binary/atlassian-bamboo-8.0.1.tar.gz
    root@bamboo:~# tar -xvf atlassian-bamboo-8.0.1.tar.gz
    root@bamboo:~# cd atlassian-bamboo-8.0.1/
    root@bamboo:~/atlassian-bamboo-8.0.1# mkdir /var/bamboo/
    root@bamboo:~/atlassian-bamboo-8.0.1# mkdir /var/bamboo/bamboo-home
    root@bamboo:~/atlassian-bamboo-8.0.1# nano atlassian-bamboo/WEB-INF/classes/bamboo-init.properties 
    root@bamboo:~/atlassian-bamboo-8.0.1# sudo apt install default-jre
    root@bamboo:~/atlassian-bamboo-8.0.1# java -version
    root@bamboo:~/atlassian-bamboo-8.0.1# ./bin/start-bamboo.sh
    root@bamboo:~/atlassian-bamboo-8.0.1# sudo apt install postgresql postgresql-contrib
    root@bamboo:~/atlassian-bamboo-8.0.1# sudo -i -u postgres
    postgres@bamboo:~$ psql
    postgres=# create user caleb with encrypted password 'mypassword';
    postgres=# create database bamboo;
    postgres=# grant all privileges on database bamboo to caleb;

Installing the Remote Agent
---------------------------

.. code-block:: bash

    root@bamboo:~# wget http://localhost:8085/agentServer/agentInstaller/atlassian-bamboo-agent-installer-8.0.1.jar
    root@bamboo:~# java -jar atlassian-bamboo-agent-installer-8.0.1.jar http://localhost:8085/agentServer/