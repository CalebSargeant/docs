Randomness
==========

Name Equals Main
----------------

https://stackoverflow.com/questions/419163/what-does-if-name-main-do

This basically makes your .py file a program of some sorts, hard to explain, read above link. If your script is executed on its own, program will run. If your script is executed from another script, it won't run.

.. code-block:: python

  # Start the program
  if __name__ == "__main__":
    main()
