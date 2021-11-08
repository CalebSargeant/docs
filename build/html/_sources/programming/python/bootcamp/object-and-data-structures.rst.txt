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
--------------------

Example of Indexing

.. code:: python

   # Grab the h from hello
   mystring = "hello world"
   mystring[0]

   # Grab the l from world 
   mystring[-2]

Example of Slicing

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
-----------------------------

.. code-block:: python

   # String Concatenattion
   name = "Sam"
   last_letters = name[1:]
   'P' + last_letters
   Pam

   letter = 'z'
   letter * 10
   zzzzzzzzzz

   2 + 3
   5

   '2' + '3'
   23

   x = 'Hello World'
   x.upper()

Print Formatting with Strings
-----------------------------

-  Often you will want to "inject a variable into your string for printing. For example:

   -  `my_name = "Caleb"`
   -  `print("Hello " + my_name)`

- There are multiple ways to format strings for printing variables in them.
- This is known as string interpolation.
- Two methods for this:

   - `.format()` method
   - `f-strings` (formatted string literals)

.. code-block:: python

   # .format() method
   print('This is a string {}'.format('INSERTED'))
   print('The {} {} {}'.format('fox','brown','quick'))
   print('The {2} {1} {0}'.format('fox','brown','quick'))
   print('The {q} {b} {f}'.format(f='fox',b='brown',q='quick'))

   # Float formatting "{value:width.precision f}"
   result = 100/777
   print("The result was {}".format(result))
   print("The result was {r:1.3f}".format(r=result))

   # f-strings method
   print(f'Hello, his name is {name}')
   name = "Sam"
   age = 3
   print(f'{name} is {age} years old)


Lists
-----

- Lists are ordered sequences that can hold a variety of object types
- They use [] brackets and commas to separate objects in the list.

   - `[1,2,3,4,5]`

- Lists support indexing and slicing. Lists can be nested and also have a variety of useful methods that can be called off of them.

.. code-block:: python

   my_list = [1,2,3]
   my_list = ['string',100,23,2]
   len(my_list)
   mylist = ['one','two','three']
   mylist[0]
   mylist[1:]
   another_list = ['four','five']
   mylist + another_list
   mylist[0] = 'ONE'
   mylist.append('six')
   mylist.pop()
   popped_item = mylist.pop()
   new_list = ['a','e','x','b','c']
   num_list = [4,1,8,3]
   new_list.sort()
   num_list.revers()


Dictionaries
------------

- Dictionaries are unordered mappings for sorting objects. Previously we saw how lists store objects in an ordered sequence, dictionaries use a key-value pairing instead.
- This key-value pair allows users to quickly grab objects without needing to know an index location.
- Dictionaries use curly braces and colons to signify the keys and their associated values.

   - `{'key1':'value1','key2':'value2'`

- So when to choose a list and when to choose a dictionary?
- **Dictionaries:** Objects retrieved by key name.

   - Unordered and can not be sorted.

- **Lists:** Objects retrieved by location.

   - Ordered Sequence can be indexed or sliced.

.. code-block:: python

   # Creating a dictionary
   my_dict = {'key1':'value1','key2':'value2'
   my_dict['key1']

   # A dict can have numbers, lists, and even other dicts
   d = {'k1':123,'k2':[0,1,2],'k3':{'insidekey':100}}
   d['k3']['insidekey']

   # Adding values to dict
   d = {'k1': 100, 'k2': 200}
   d['k3'] = 300

   # Overwriting values
   d['k1'] = 'NEW VALUE'

   # Return the keys
   d.keys()

   # Return the values
   d.values()

   # Return the items
   d.items()
   

Tuples
------

- Tuples are very similar to lists. However they have one key difference - immutability.
- Once an element is inside a tuple, it cannot be reassigned
- Tuples use parenthesis (1,2,3)

.. code-block:: python

   t = (1,2,3)
   t = ('one',2)
   t = ('a','a','b')
   t.count('a')
   t.index('a')

Sets and Booleans
-----------------

Sets

- **Sets** are unordered collections of **unique** elements
- Meaning there can only be one representative of the same object.

.. code-block:: python

   myset = set()
   myset.add(1)
   myset

   myset.add(2)
   myset

   myset.add(2)
   myset

   mylist = [1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3]
   set(mylist)

Booleans

- **Booleans** are operators that allow you to convey **True** or **False** statements
- These are very important later on when we deal with control flow and logic!

.. code-block:: python

   False
   True
   type(False)
   1 > 2
   1 == 1
   b = None
   b

Files
-----

.. code-block:: python

   # Opening a file
   myfile = open('myfile.txt')
   myfile.read()

   # The second time you open, the curser is at the end of the file
   myfile.read()

   # Seak to 0 to go back to the beginning of the file
   myfile.seak(0)

   # Read the file, all in one line
   contents = myfile.read()

   # Read the file all in new lines
   myfile.readlines()

   # Close the file
   myfile.close()

   # Read the file and close it after
   with open('myfile.txt') as my_new_file:
      contents = my_new_file.read()
   contents

   # Write to file
   with open('myfile.txt',mode='w') as myfile:
      contents = myfile.read()
   contents

   # Reading
   with open('my_new_file.txt',mode='r') as f:
      print(f.read())

   # Appending
   with open('my_new_file.txt',mode='a') as f:
      f.write('FOUR')
   
   # Writing
   with open('sjkdhsakjfj.txt',mode='w') as f:
      f.write('I CREATED THIS FILE')
   
Reading, Writing, Appending Modes

- mode='r' is read only
- mode='w is write only (will overwrite files or create new)
- mode='a' is append only (will add on to files)
- mode='r+' is reading and writing
- mode='w+' is writing and reading (overwrites existing files or creates a new file)

   