Introducing Strings, Collections, and Iteration
===============================================

String
------

- str

  - Data type for strings in Python
  - Sequence of Unicode code points
  - Immutable
  - Unicode
  - Python 3 source encoding is UTF-8

.. code-block:: py

  'This is a string'
  "This is also a string"
  '"Yes!", he said, "I agree!"'

String Literals
---------------

.. code-block:: py

  >>> "first" "second"
  'firstsecond'

Strings with Newlines
^^^^^^^^^^^^^^^^^^^^^

- Multiline strings

  - Spread the literal across multiple lines

.. code-block:: none

  >>> "" "This is
  ... a multiline
  ... string"""
  This is\na multiline\nstring'
  >>> '''So
  ... is
  ... this.'''
  So\nis\nthis.
  >>> m = 'This string\nspans multiple\nlines'
  >>> m
  'This string\nspans multiple\nlines'
  >>> print(m)
  This string
  spans multiple
  lines

- Escape sequences

  - Embed escape sequences in a single-line literal

 .. code-block:: none

   >>> "This is a \" in a string"
   'This is a " in a string'
   >>> 'This is a \' in a string'
   "This is a ' in a string"
   >>> 'This is a \" and a \' in a string'
   'This is a " and a \' in a string'
   >>> k = 'A \\ in a string'
   'A \\ in a string'
   >>> print(k)
   A \ in a string

**All Escape Sequences**

docs.python.org/3/reference/lexical_analysis.html#strings

+------------+----------------------------------------------+
| Sequence   | Meaning                                      |
+============+==============================================+
| \newline   | Backslash and newline ignored                |
+------------+----------------------------------------------+
| \\         | Backslash (\)                                |
+------------+----------------------------------------------+
| \'         | Single quotes (")                            |
+------------+----------------------------------------------+
| \"         | Double quote (")                             |
+------------+----------------------------------------------+
| \a         | ASCII Bell (BEL)                             |
+------------+----------------------------------------------+
| \b         | ASCII Backspace (BS)                         |
+------------+----------------------------------------------+
| \f         | ASCII Formfeed (FF)                          |
+------------+----------------------------------------------+
| \n         | ASCII Linefeed (LF)                          |
+------------+----------------------------------------------+
| \r         | ASCII Carriage Return (CR)                   |
+------------+----------------------------------------------+
| \t         | ASCII Horizontal Tab (TAB)                   |
+------------+----------------------------------------------+
| \v         | ASCII Vertical Tab (VT)                      |
+------------+----------------------------------------------+
| \ooo       | Character with octal value 000               |
+------------+----------------------------------------------+
| \xhh       | Character with hex value hh                  |
+------------+----------------------------------------------+

+------------+----------------------------------------------+
| Only recognized in string literals                        |
+============+==============================================+
| \N{name}   | Character named name in the Unicode database |
+------------+----------------------------------------------+
| \uxxxx     | Character with 16-bit hex value XXXX         |
+------------+----------------------------------------------+
| \Uxxxxxxxx | Character with 32-bit hex value XxXXXXXX     |
+------------+----------------------------------------------+

String Features
^^^^^^^^^^^^^^^

.. code-block:: none

  >>> path = r'C:\Users\Merlin\Documents\Spells'
  >>> path
  'C: \\Users\\Merlin\\Documents\\Spells'
  >>> print(path)
  C:\Users\Merlin\Documents\Spells
  >>> str(496)
  '496'
  >>> str(6.02e23)
  '6.02e+23'
  >>> s = 'parrot'
  >>> s[4]
  'o'
  >>> type(s[4])
  <class 'str'>

Bytes
-----

docs.python.org/3/library/codecs.html#standard-encodings

- bytes

  - Data type for sequences of bytes
  - Raw binary data
  - Fixed-width single-byte encodings

.. code-block:: none

  >>> b'data'
  b'data'
  >>> b"data"
  b'data'
  >>> d = b'some bytes'
  >>> d[0]
  115
  >>> d.split()
  [b'some', b'bytes']

List
----

- list

  - Sequences of objects
  - Mutable
  - A workhorse in Python

.. code-block:: none

  >>> [1, 9, 8]
  [1, 9, 8]
  >>> a = ["apple", "orrange", "pear"]
  >>> a[1]
  'orrange'
  >>> a[1] = 7
  >>> a
  ['apple', 7, 'pear']
  >>> b = []
  >>> b.append(1.618)
  >>> b
  [1.618]
  >>> b.append(1.414)
  >>> b
  [1.618, 1.414]
  >>> list("characters")
  ['c', 'h', 'a', 'r', 'a', 'c', 't', 'e', 'r', 's']
  >>> c = ['bear',
  ... 'giraffe',
  ... 'elephant',
  ... 'caterpillar',]
  >>> c
  ['bear', 'giraffe', 'elephant', 'caterpillar']

Dict
----

- dict

  - Fundamental data structure Python
  - Map keys to values
  - Also known as maps or associative arrays

.. code-block:: none

  >>> d = {'alice': '878-8728-922', 'bob': '256-4532-523', 'eve': '123-3432-342'}
  >>> d['alice']
  '878-8728-922'
  >>> d['alice'] = '323-3123-156'
  >>> d
  {'alice': '323-3123-156', 'bob': '256-4532-523', 'eve': '123-3432-342'}
  >>> d['charles'] = '123-5232-125'
  >>> d
  {'alice': '323-3123-156', 'bob': '256-4532-523', 'eve': '123-3432-342', 'charles': '123-5232-125'}

For-loop
--------

- for-loop

  - Visit each item in an iterable sequence
  - .. code-block:: none

      for item in iterable:
          body

.. code-block:: none

  >>> cities = ["Cape Town", "London", "New York", "Paris"]
  >>> for city in cities:
  ...     print(city)
  ...
  Cape Town
  London
  New York
  Paris
  >>> colors = {'crimson': 0xdc143c, 'coral': 0xff7f50, 'teal': 0x008080}
  >>> for color in colors:
  ...     print(color, colors[color])
  ...
  crimson 14423100
  coral 16744272
  teal 32896

Putting it all Together
-----------------------

.. code-block:: none

  >>> from urllib.request import urlopen
  >>> story = urlopen('http://sixty-north.com/c/t.txt')
  >>>
  >>> story_words = []
  >>> for line in story:
  ...     line_words = line.split()
  ...     for word in line_words:
  ...         story_words.append(word)
  ...
  >>> story.close()
  >>> story_words
  [b'It', b'was', b'the', b'best', b'of', b'times', b'it', b'was', b'the', b'worst', b'of', b'times', b'it', b'was', b'the', b'age', b'of', b'wisdom', b'it', b'was', b'the', b'age', b'of', b'foolishness', b'it', b'was', b'the', b'epoch', b'of', b'belief', b'it', b'was', b'the', b'epoch', b'of', b'incredulity', b'it', b'was', b'the', b'season', b'of', b'Light', b'it', b'was', b'the', b'season', b'of', b'Darkness', b'it', b'was', b'the', b'spring', b'of', b'hope', b'it', b'was', b'the', b'winter', b'of', b'despair', b'we', b'had', b'everything', b'before', b'us', b'we', b'had', b'nothing', b'before', b'us', b'we', b'were', b'all', b'going', b'direct', b'to', b'Heaven', b'we', b'were', b'all', b'going', b'direct', b'the', b'other', b'way', b'in', b'short', b'the', b'period', b'was', b'so', b'far', b'like', b'the', b'present', b'period', b'that', b'some', b'of', b'its', b'noisiest', b'authorities', b'insisted', b'on', b'its', b'being', b'received', b'for', b'good', b'or', b'for', b'evil', b'in', b'the', b'superlative', b'degree', b'of', b'comparison', b'only']

Recall Bytes
^^^^^^^^^^^^

- Bytes literals prefixed with lowercase 'b'
- HTTP data is provided as bytes
- Use bytes.decode() to get strings

.. code-block:: none

  >>> story = urlopen('http://sixty-north.com/c/t.txt')
  >>> story_words = []
  >>> for line in story:
  ...     line_words = line.decode('utf8').split()
  ...     for word in line_words:
  ...         story_words.append(word)
  ...
  >>> story.close()
  >>> story_words
  ['It', 'was', 'the', 'best', 'of', 'times', 'it', 'was', 'the', 'worst', 'of', 'times', 'it', 'was', 'the', 'age', 'of', 'wisdom', 'it', 'was', 'the', 'age', 'of', 'foolishness', 'it', 'was', 'the', 'epoch', 'of', 'belief', 'it', 'was', 'the', 'epoch', 'of', 'incredulity', 'it', 'was', 'the', 'season', 'of', 'Light', 'it', 'was', 'the', 'season', 'of', 'Darkness', 'it', 'was', 'the', 'spring', 'of', 'hope', 'it', 'was', 'the', 'winter', 'of', 'despair', 'we', 'had', 'everything', 'before', 'us', 'we', 'had', 'nothing', 'before', 'us', 'we', 'were', 'all', 'going', 'direct', 'to', 'Heaven', 'we', 'were', 'all', 'going', 'direct', 'the', 'other', 'way', 'in', 'short', 'the', 'period', 'was', 'so', 'far', 'like', 'the', 'present', 'period', 'that', 'some', 'of', 'its', 'noisiest', 'authorities', 'insisted', 'on', 'its', 'being', 'received', 'for', 'good', 'or', 'for', 'evil', 'in', 'the', 'superlative', 'degree', 'of', 'comparison', 'only']
