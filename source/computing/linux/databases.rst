Databases
=========

MySQL
-----

Creating a User
^^^^^^^^^^^^^^^

.. code-block:: bash

  create user 'myuser'@'localhost' identified by 'password';

Deleting a User
^^^^^^^^^^^^^^^

.. code-block:: bash

  drop user 'user'@'localhost';

Showing Users
^^^^^^^^^^^^^

.. code-block:: bash

  select user from mysql.user;
  select user,host from mysql.user;

Logging in Remotely
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # You can -p'mypassword' as well
  mysql -u myuser -p -h mydbhostname.com -D mydatabase

Granting Privileges
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # Note that localhost could be a location somewhere else, like a source IP Address of machine connecting to mysql
  grant all privileges on mydb to 'user'@'localhost';

Showing Privileges
^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  show grants for 'username'@'host';

Checking MySQL Status
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  service mysqld status
  ps aux | grep mysql


Backup
^^^^^^

.. code-block:: bash

  # Backup directly to a remote host (zabbix is the DB name)
  # That pipes the mysqldump command through gzip, then to through and SSH connection. SSH on the remote side runs the ‘cat’ command to read the stdin, then redirects that to the actual file where I want it saved.
  mysqldump -u root -p zabbix | gzip -c | ssh caleb.sargeant@server.example.com "cat > zabbix.sql.gz"

Restore
^^^^^^^

The file must be in .sql format. It can not be compressed in a .zip or .tar.gz file.

``mysql -p -u username database_name < file.sql``

Setting up Replication
^^^^^^^^^^^^^^^^^^^^^^

https://www.digitalocean.com/community/tutorials/how-to-set-up-replication-in-mysql

Size of DB
^^^^^^^^^^

.. code-block:: bash

  SELECT table_schema "zabbix",
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) "DB Size in MB"
  FROM information_schema.tables
  GROUP BY table_schema;

Resetting Root Password
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  /etc/init.d/mysqld stop
  mysqld_safe --skip-grant-tables &
  mysql -u root
  mysql> use mysql;
  mysql> update user set password=PASSWORD("newrootpassword") where User='root';
  mysql> flush privileges;
  mysql> quit
  /etc/init.d/mysqld stop
  /etc/init.d/mysqld start
