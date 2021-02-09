Object and Data Structures
==========================

Summary
-------

+-----------------------+-----------------------+-----------------------+
| Name                  | Type                  | Description           |
+=======================+=======================+=======================+
| Integers              | int                   | Whole numbers, such   |
|                       |                       | as: ``3 300 200``     |
+-----------------------+-----------------------+-----------------------+
| Floating point        | float                 | Numbers with a        |
|                       |                       | decimal point:        |
|                       |                       | ``2.3 4.6 100.0``     |
+-----------------------+-----------------------+-----------------------+
| Strings               | str                   | Ordered sequence of   |
|                       |                       | characters:           |
|                       |                       | ``"hello" '           |
|                       |                       | Caleb' "awe" '2020'`` |
+-----------------------+-----------------------+-----------------------+
| Lists                 | list                  | Ordered sequence of   |
|                       |                       | objects:              |
|                       |                       | `                     |
|                       |                       | `[10,"hello",200.3]`` |
+-----------------------+-----------------------+-----------------------+
| Dictionaries          | dict                  | Unordered Key:Value   |
|                       |                       | pairs:                |
|                       |                       | ``{"mykey":"val       |
|                       |                       | ue","name","Caleb"}`` |
+-----------------------+-----------------------+-----------------------+
| Tuples                | tup                   | Ordered immutable     |
|                       |                       | sequence of objects:  |
|                       |                       | `                     |
|                       |                       | `(10,"hello",200.3)`` |
+-----------------------+-----------------------+-----------------------+
| Sets                  | set                   | Unordered collection  |
|                       |                       | of unique objects:    |
|                       |                       | ``{"a","b"}``         |
+-----------------------+-----------------------+-----------------------+
| Booleans              | bool                  | Logical value         |
|                       |                       | indicating ``True``   |
|                       |                       | or ``False``          |
+-----------------------+-----------------------+-----------------------+

Numbers
-------

Basic math
~~~~~~~~~~

.. code:: python

   # Addition
   2+1

   # Subtraction
   2-1

   # Multiplication
   2*2

   # Division
   3/2

   # Preposition (exponentials)
   2 ** 3

Modulo or “Mod” Operator
^^^^^^^^^^^^^^^^^^^^^^^^

.. code:: python

   ## Mod
   # Give the remainder of 7/4
   7 % 4

   # This gives 0 (nothing left over)
   50 % 5

   # This results in 1, telling us it's odd
   23 % 2

BODMAS
^^^^^^

.. code:: python

   # Result of 105
   2 + 10 * 10 + 3

   # Result of 156
   (2 + 10) * (10 + 3)

Variable Assignment
-------------------

Rules for Variable Names
~~~~~~~~~~~~~~~~~~~~~~~~

-  Names can’t start with a number
-  There can be no spaces in the name, use ``_``\ instead.
-  Can’t use any of these symbols: ``:'",<>/?|\()!@#$%^&*~-+``
-  Best practice (PEP8) that names are lowercase.
-  Avoid using words that have special meaning in Python like “list” and
   “str”

Dynamic Typing
~~~~~~~~~~~~~~

-  Python uses **Dynamic Typing**
-  You can reassign variables to different data types
-  This makes Python very flexible in assigning data types, this is
   different than other languages that are **“Statically-Typed”**

**Example of Dynamic Typing in Python**
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code:: python

   # Assigning a var a different data type (eg) from number to list works in Python,
   # but not in other languages, as described above
   my_cats = 2
   my_cats = ["Coco", "Frosty"]

Example of Static Typing in C++
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code:: cpp

   int my_dog = 1;
   my_dog = "Sammy"; //results in error - no longer integer

Pros & Cons of Dynamic Typing
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-  Pros of Dynamic Typing:

   -  Very easy to work with
   -  Faster development time

-  Cons of Dynamic Typing:

   -  May result in bugs of unexpected data types!
   -  You need to be aware of ``type()``

Assigning Variables
~~~~~~~~~~~~~~~~~~~

.. code:: python

   # assign a as 5
   a = 5

   # take the current value of a,
   # add it to itself and assign its new value
   a = a + a

   # See value is now 10
   a

   # assign the new value
   a = a + a

   # See the value is now 20
   a

   # see that a is an int
   type(a)

   # assign a a new data type
   a = 30.1

   # See that a is now a float
   type(a)

   int = 4

Example of variable assignment
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code:: python

   # Do some math to find your taxes
   my_income = 100
   tax_rate = 0.1
   my_taxes = my_income * tax_rate

   # See the value of my taxes
   my_taxes

Strings
-------

Basics
~~~~~~

Strings are sequences of characters, using the syntax of either single
quotes or double quotes:

-  ‘howzit’
-  “hello”
-  " some stuff written here "
-  Strings are **ordered sequences**, so we can use **indexing** and
   **slicing** to grab sub-sections of the string.
-  Indexing notation uses ``[]`` notation after the string (or variable
   assigned the string).
-  Indexing allows you to grab a single character from the string…
-  These actions use ``[]``\ square brackets and a number index to
   indicate positions of what you wish to grab.

   -  **Character**: h e l l o
   -  **Index**: 0 1 2 3 4
   -  **Reverse Index**: 0 -4 -3 -2 -1

-  Slicing allows you to grab a subsection of multiple characters, a
   “slice” of the string/
-  This has the following syntax:

   -  ``[start:stop:step]``

-  **start** is a numerical index for the slice start
-  **stop** is the index you will go up to (but not include)
-  **step** is the size of the “jump” you take

Examples of strings
^^^^^^^^^^^^^^^^^^^

.. code:: python

   # output some strings y'all
   'hello'
   "world"

   # a space is a char
   ' this is a string too! '

   # enclose in doubles if you've got a single, etc.
   "I'm a python master"

   # printing strings just shows the output of string
   print("string")

   # print, escaping a new line
   print('hello\nworld')

   # print, escaping a tab
   print('hello\tworld')

   # output length of string (5 in this case)
   len('hello')

   # output length, notice space counts
   len('I am')

Indexing and Slicing
~~~~~~~~~~~~~~~~~~~~

Example of Indexing
^^^^^^^^^^^^^^^^^^^

.. code:: python

   # Grab the h from hello
   mystring = "hello world"
   mystring[0]

   # Grab the l from world 
   mystring[-2]

Example of Slicing
^^^^^^^^^^^^^^^^^^

.. code:: python

   # Redefine the string
   mystring = 'abcdefghijk'

   # Slice from 3rd char to end (stop & step undefined)
   mystring[2:]

   # Slice up to 4th char (not incl.) from beginning (start & step undefined)
   mystring[:3]

   # Slice 4th to 6th char (get rid of 0-3 & 7-11)
   mystring[3:6]

   # Slice the string as a whole, valid syntax
   mystring[::]

   # Slice 2nd char (in jumps of 2)
   mystring[::2]

   # Slice taking 3rd char up until 8th char (not incl.) in steps of 2
   mystring[2:7:2]

   # Reverse the order of text - take backwards steps
   mystring[::-1]

String Properties and Methods
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Print Formatting with Strings
-----------------------------

Lists
-----

Dictionaries
------------

Tuples
------

Sets and Booleans
-----------------

Files
-----
