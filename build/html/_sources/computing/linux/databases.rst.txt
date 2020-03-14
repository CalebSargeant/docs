Databases
=========

MySQL
-----

Backup
^^^^^^

.. code-block:: bash

  # Backup directly to a remote host (zabbix is the DB name)
  # That pipes the mysqldump command through gzip, then to through and SSH connection. SSH on the remote side runs the ‘cat’ command to read the stdin, then redirects that to the actual file where I want it saved.
  mysqldump -u root -p zabbix | gzip -c | ssh caleb.sargeant@i5-r-sftp.uk02.kexpress.net "cat > zabbix.sql.gz"

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

Using SSH to Import Database
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

The file must be in .sql format. It can not be compressed in a .zip or .tar.gz file.
4. Upload the SQL file to the server.
5. If the database does not exist please create one with an user. Note the username and password.
6. Log into the server through SSH
7. Navigate to the directory where your .sql file is.
9. Type this this command:
mysql -p -u username database_name < file.sql
