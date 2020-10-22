Arguments
=========

Argparse
--------

https://stackabuse.com/command-line-arguments-in-python/

http://zetcode.com/python/argparse/

https://stackoverflow.com/questions/22570407/how-to-store-argparse-values-in-variables

Gentleman's agreement: optional arguments should be flags, and required arguments should be positional.

.. code-block:: python

  # Positional arguments
  import argparse

  parser = argparse.ArgumentParser(description="Do this and that")
  parser.add_argument("arg1", help="arg1 is for this")
  parser.add_argument("arg2", help="arg2 is for that")
  parser.add_argument("arg3", help="arg3 is for the other")
  args = parser.parse_args()

  print(args.arg1)
  print(args.arg2)
  print(args.arg3)

  # Flagged arguments
  import argparse

  parser = argparse.ArgumentParser(description="Do this and that")
  parser.add_argument("--arg1", "-a", help="arg1 is for this", required=True)
  parser.add_argument("--arg2", "-b", help="arg2 is for that", required=True)
  parser.add_argument("--arg3", "-c", help="arg3 is for the other", required=True)
  args = parser.parse_args()

  print(args.arg1)
  print(args.arg2)
  print(args.arg3)
