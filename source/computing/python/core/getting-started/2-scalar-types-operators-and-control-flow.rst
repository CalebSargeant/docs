Scalar Types, Operators, and Control Flow
=========================================

Scalar Types
------------

- int (42)

  - arbitrary precision integer
  - unlimited precision signed integer

.. code-block::

  >>> 10
  10
  >>> 0b10
  2
  >>> 0010
  8
  >>> 0x10
  16
  >>> int (3.5)
  3
  >>> int(-3.5)
  -3
  >>> int("496")
  496
  >>> int ("10000", 3)
  81

- float (4.2)

  - 64-bit floating point numbers
  - IEEE-754 double-precision with 53-bits of binary precision
  - 15-16 significant digits in decimal

.. code-block::

  >>> 3.125
  3.125
  >>> 3e8
  300000000.0
  >>> 1.616e-35
  1.616e-35
  >>> float(7)
  7.0
  >>> float("1.618")
  1.618
  >>> float("nan")
  nan
  >>> float("inf")
  inf
  >>> float("-inf")
  -inf
  >>> 3.0 + 1
  4.0

- None (NoneType)

  - the null object
  - Null value
  - Often represents the absence of a value

.. code-block::

  >>> None
  >>> a = None
  >>> a is none
  True

- bool (True/False)

  - boolean logical values

.. code-block::

  >>> True
  True
  >>> False
  False
  >>> bool(0)
  False
  >>> bool(42)
  True
  >>> bool(-1)
  True
  >>> bool(0.0)
  False
  >>> bool(0.207)
  True
  >>> bool(-1.117)
  True
  >>> bool([])
  False
  >>> bool([1, 5, 9])
  True
  >>> bool("")
  False
  >>> bool("Spam")
  True
  >>> bool("False")
  True
  >>> bool("True")
  True

Relational Operators
--------------------

+----+----------------------------------+
| == | value equality / equivalence     |
+----+----------------------------------+
| != | value inequality / inequivalence |
+----+----------------------------------+
| <  | less-than                        |
+----+----------------------------------+
| >  | greater-than                     |
+----+----------------------------------+
| <= | less-than or equal               |
+----+----------------------------------+
| >= | greater-than or equal            |
+----+----------------------------------+

.. code-block::

  >>> g = 20
  >>> g == 20
  True
  g == 13
  False
  >>> g != 20
  False
  g != 13
  True
  >>> g < 30
  True
  >>> g <= 20
  True
  >>> g > 30
  False
  >>> g >= 20
  True

Control Flow
------------

**Conditional statement**

Branch execution based on the value of an expression

if statement
^^^^^^^^^^^^

.. code-block::

  # Syntax
  >>> if expression:
      block

  # Examples
  >>> if True:
  ...    print("It's true!")
  ...
  It's True
  >>> if False:
  ...    print("It's true!")
  ...
  >>> if bool("eggs"):
  ...    print("Yes please!")
  ...
  Yes please!
  >>> if "eggs" :
  ...    print("Yes please!")
  ...
  Yes please!
  >>>

Else-clause
^^^^^^^^^^^

.. code-block::

  >>> if h > 50 :
  ...    print("Greater than 50")
  ... else:
  ...    print("50 or smaller")
  50 or smaller
  >>> if h > 50:
  ...    print("Greater than 50")
  ... else:
  ...    if h < 20:
  ...        print("Less than 20")
  ...    else:
  ...        print ("Between 20 and 50")
  Between 20 and 50
  >>> if h > 50:
  ...    print("Greater than 50")
  ... elif h < 20:
  ...    print("Less than 20")
  ... else:
  ...    print("Between 20 and 50")
  Between 20 and 50

While-loops
-----------

.. code-block:: python

  # Syntax
  while expression:
    block

  # Example (will print 12345)
  c = 5
  while c != 0:
    print(c)
    c -= 1

  # Example (will print 54321)
  c = 5
  while c:
    print(c)
    c -= 1

  ## int truthiness
  # bool(5) == True
  # bool(4) == True
  # ...
  # bool(0) == False

Break
^^^^^

- Many languages support a loop ending in a predicate test
- C, C++, C#, and Java have do-while
- Python requires you to use while True and break
- ``break`` jumps out of the inner-most executing loop to the line immediately after it

.. code-block:: python

  while True:
    response = input()
    if int(response) % 7 == 0:
      break
  # start typing in numbers until a number is divisible by 7

  
