JSON
====

Output in JSON
--------------

https://stackoverflow.com/questions/352098/how-can-i-pretty-print-json-in-a-shell-script

.. code-block:: bash

  cat myfile | python -m json.tool

Iterating over Dictionary Items
-------------------------------

https://stackoverflow.com/questions/12353288/getting-values-from-json-using-python

https://stackoverflow.com/questions/34937884/retrieving-key-value-of-json-data-python

.. code-block:: python

  # Iterating over just keys
  for key, value in data:
    print key

  # Iterating over keys and values
  for key, value in data.items():
    print key, value
