Strings
=======

Remove Whitespace
-----------------

https://stackoverflow.com/questions/8270092/remove-all-whitespace-in-a-string

https://stackoverflow.com/questions/1185524/how-do-i-trim-whitespace

Notice where the spaces are being removed. ``lstrip`` removes space from right-hand-side (leading), ``rstrip`` removes space from left-hand-side (trailing), and ``strip`` from both sides (not the middle).

.. code-block:: python

  >>> sentence = ' howzit  ma  bru '
  >>> sentence.strip()
  'howzit  ma  bru'
  >>> sentence.lstrip()
  'howzit  ma  bru '
  >>> sentence.rstrip()
  ' howzit  ma  bru'

Converting to String
--------------------

https://stackoverflow.com/questions/3204614/how-to-change-any-data-type-into-a-string-in-python

.. code-block:: python

  str(var)
