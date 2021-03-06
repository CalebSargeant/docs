########
Robocopy
########

.. code-block:: bat

  robocopy c:\Sourcepath c:\Destpath /E /XC /XN /XO /XD c:\sourcepath\excludeme

  :: /E makes Robocopy recursively copy subdirectories, including empty ones.
  :: /XC excludes existing files with the same timestamp, but different file sizes. Robocopy normally overwrites those.
  :: /XN excludes existing files newer than the copy in the source directory. Robocopy normally overwrites those.
  :: /XO excludes existing files older than the copy in the source directory. Robocopy normally overwrites those.
  :: With the Changed, Older, and Newer classes excluded, Robocopy will exclude files existing in the destination directory.
  :: /XD excludes a specified directory
  :: /R:n indicates number of retries on failed copies, such as those encountering on open files. By default RoboCopy retries for 1 million times.
  :: /W:n indicates the wait time between retries. By default it is 30 seconds. If you want RoboCopy to skip any failed copy quickly, reduce it to lesser amount.
  :: ( robocopy C:\ D:\ /w:1 /r:1 )

  robocopy c:\users\username z:\Backups\username /E /XC /XN /XO /XD
