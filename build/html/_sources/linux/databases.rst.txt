=========
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
