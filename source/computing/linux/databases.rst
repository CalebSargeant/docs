Databases
=========

MySQL
-----

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
