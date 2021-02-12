Modularity
==========

Modules
-------

:file:`_docs/words.py`

.. code-block:: python

  python3 words.py

Functions
---------

Defining Functions
^^^^^^^^^^^^^^^^^^

.. code-block::

  >>> def square(x):
  ...     return x * x
  ...
  >>> square(5)
  25
  >>> def launch_missiles():
  ...     print("Missiles launched!")
  ...
  >>> launch_missiles()
  Missiles launched!
  >>> def even_or_odd(n):
  ...     if n % 2 == 0:
  ...             print("even")
  ...             return
  ...     print("odd")
  ...
  >>> w = even_or_odd(31)
  odd
  >>> w is None
  True
  >>> def nth_root(radicand, n):
  ...     return radicand ** (1/n)
  ...
  >>> nth_root(16,2)
  4.0
  >>> nth_root(27,3)
  3.0

**dunder**

- Our way of pronouncing special names
- A portmanteau of "double underscore"
- Instead of "underscore underscore name underscore underscore" we'll say "dunder name"

name
----

:code:`__name__`

- Specially named variable allowing us to detect whether a module is run as a script or imported into another module.
- :code:`if __name__ == '__main__':` if name = main, execute function, if name != main, it knows it's being imported into another module, not executed. By using this statement, the python script can be executed as a script or module.
- :code:`__name__` will be set as :code:`__main__` depending on how it's used - if running :code:`python words.py`, :code:`__main__` will return as :code:`__name__` instead.

.. code-block:: python

  print(__name__)

The Python Execution Model
--------------------------

- :code:`def` is a statement
- Top-level functions are defined when a module is imported or run

Module Script or Program
^^^^^^^^^^^^^^^^^^^^^^^^

- Python module - Convenient import with API
- Python script - Convenient execution from the command line (scripts should be importable)
- Python program - Perhaps composed of many modules

Command Line Arguments
----------------------

.. code-block:: py

  import sys
  from urllib.request import urlopen

  def fetch_words(url):
      story = urlopen(url)
      story_words = []
      for line in story:
          line_words = line.decode('utf-8').split()
          for word in line_words:
              story_words.append(word)
      story.close()
      return story_words

  def print_items(items):
      for item in items:
          print (item)

  def main():
      words = fetch_words()
      print_words(words)

  if __name__ == '__main__':
      main(sys.argv[1])

Docstrings
----------

- Literal strings which document functions, modules, and classes.
- They must be the first statement in the blocks for these constructs.
- PEP 257

  - Official Python convention for docstrings.
  - But... not widely adopted.

- Sphinx

  - Tool to create HTML documentation from Python docstrings.

.. code-block:: py

  """ Retrieve and print words from a URL.

  Usage:

    python3 words.py <URL>
  """

  import sys
  from urllib.request import urlopen


  def fetch_words(url):
      """Fetch a list of words from a URL.

        Args:
          url: The URL of a UTF-8 text-document.

        Returns:
          A list of strings containing words from the document
      """
      story = urlopen(url)
      story_words = []
      for line in story:
          line_words = line.decode('utf-8').split()
          for word in line_words:
              story_words.append(word)
      story.close()
      return story_words


  def print_items(items):
      """Print items one per line.

          Args:
              An iterable series of printable items.
      """
      for item in items:
          print (item)


  def main():
      """Print each word from a text document from at a URL.

          Args:
              url: The URL of a UTF-8 text document.
      """
      words = fetch_words()
      print_words(words)


  if __name__ == '__main__':
      main(sys.argv[1])

.. code-block::

  >>> import words
  >>> help(words)
  Help on module words:

  NAME
      words - Retrieve and print words from a URL.

  DESCRIPTION
      Usage:

          python3 words.py <URL>

  FUNCTIONS
      fetch_words(url)
          Fetch a list of words from a URL.

          Args:
              url: The URL of a UTF-8 text document.

          Returns:
              A list of strings containing the words from the document

      main(url)
          Print each word from a text document from at a URL.

Comments
--------

* Code is ideally clear enough without ancillary explanation
* Sometimes you need to explain why your code is written as it is
* Comments in Python start with ``#`` and extend to the end of the line

.. code-block:: python

  if _name_ =='__main__':
  main(sys.argv[1]) # The Oth arg is the module filename.]

Shebang
-------

- Special Comment
- ``#!/usr/bin/env python``
- ``#!/usr/bin/env python3``

Pylauncher
^^^^^^^^^^

On Windows

1. Associated with ``*.py`` files
2. Executable is ``py.exe`` and is on the ``PATH``
3. Parse the shebang and locate Python
4. PEP397
