Objects and Types
=================

Passing Arguments and Returning Values
--------------------------------------

Argument Passing
^^^^^^^^^^^^^^^^

When we pass an object reference to a function, we're essentially assigning from an actual argument reference, in this case ``m`` to the formal argument reference, in this case ``k``. Assignment causes the reference being assigned to being referred **to** the same object as the reference being assigned **from**, which is what's going on here:

.. code-block:: none

  >>> m = [9, 15, 24]
  >>> def modify(k):
  ...     k.append(39)
  ...     print("k =", k)
  ...
  >>> modify(m)
  k = [9, 15, 24, 39]
  >>> m
  [9, 15, 24, 39]

If you want a function to modify the copy of an object, it's the responsibility of the function to do the copying.

Replacing Argument Value
^^^^^^^^^^^^^^^^^^^^^^^^

``f`` still refers to the unmodified list, this time the function didn't modify the object it passed in.

.. code-block:: none

  >>> f = [14, 23, 37]
  >>> def replace(g):
  ...     g = [17, 28, 45]
  ...     print("g =", g)
  ...
  >>> replace(f)
  g = [17, 28, 45]
  >>> f
  [14, 23, 37]

The object reference named ``f`` was assigned to the formal argument named ``g``, so ``g`` and ``f`` did refer the the same object, just as in previous example. However in the first line in the function we reassigned the reference ``g`` to point to a newly constructed list. So within the function, the reference to the original list was overwritten, although the orignal list was still pointed to by the ``f`` reference outside the function.

Mutable Arguments
^^^^^^^^^^^^^^^^^

.. code-block:: none

  >>> def replace_contents(g):
  ...     g[0] = 17
  ...     g[1] = 28
  ...     g[2] = 45
  ...     print("g =", g)
  ...
  >>> f = [14, 23, 37]
  >>> replace_contents(f)
  g = [17, 28, 45]
  >>> f
  [17, 28, 45]

- Function arguments are transferred using pass-by-object-reference.
- References to objects are copied, not the objects themselves.

.. code-block:: none

  >>> def f(d):
  ...     return d
  ...
  >>> c = [6, 10, 16]
  >>> e = f(c)
  >>> c is e
  True

Function Arguments
------------------

Default Argument Values
^^^^^^^^^^^^^^^^^^^^^^^

Arguments with default values must come after those without default values.

.. code-block:: none

  >>> def banner (message, border='-'):
  ...     line = border * len(message)
  ...     print (line)
  ...     print(message)
  ...     print(line)
  ...
  >>> banner("Howzit my bru!")
  --------------
  Howzit my bru!
  --------------
  >>> banner("Sun, Moon, Stars", "*")
  ****************
  Sun, Moon, Stars
  ****************
  >>> banner("Sun, Moon, Stars", border="*")
  ****************
  Sun, Moon, Stars
  ****************
  >>> banner(border=".", message="Hello from Earth, we come in peace!")
  ...................................
  Hello from Earth, we come in peace!
  ...................................

When Are Default Values Evaluated?
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  >>> import time
  >>> time.ctime()
  'Fri Feb 12 20:26:02 2021'
  >>> def show_default(arg=time.ctime()):
  ...     print(arg)
  ...
  >>> show_default()
  Fri Feb 12 20:26:35 2021
  >>> show_default()
  Fri Feb 12 20:26:35 2021
  >>> show_default()
  Fri Feb 12 20:26:35 2021

- Remember that ``def`` is a statement executed at runtime
- Default arguments are evaluated when ``def`` is executed
- Immutable default values don't cause problems
- Mutable default values can cause confusing effects

Mutable Default Values
^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  >>> def add_spam(menu=[]):
  ...     menu.append("spam")
  ...     return menu
  ...
  >>> breakfast = ['bacon', 'eggs']
  >>> add_spam(breakfast)
  ['bacon', 'eggs', 'spam']
  >>> lunch = ['baked beans']
  >>> add_spam(lunch)
  ['baked beans', 'spam']
  >>> add_spam()
  ['spam']
  >>> add_spam()
  ['spam', 'spam']
  >>> add_spam()
  ['spam', 'spam', 'spam']

- The empty list that's used for the default argument is created once when the ``def`` statement is executed. The first time, spam is added, when adding second time, list still contains spam.
- So always use immutable objects for default values!

Immutable Default Values
^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  >>> def add_spam(menu=None):
  ...     if menu is None:
  ...         menu = []
  ...     menu.append('spam')
  ...     return menu
  ...
  >>> add_spam()
  ['spam']
  >>> add_spam()
  ['spam']
  >>> add_spam()
  ['spam']

Python's Type System
--------------------

.. code-block:: none

  >>> def add(a, b):
  ...     return a+b
  ...
  >>> add(5,7)
  12
  >>> add(3.1, 2.4)
  5.5
  >>> add("news", "paper")
  'newspaper'
  >>> add([1, 6], [21, 107])
  [1, 6, 21, 107]
  >>> add("The answer is", 42)
  Traceback (most recent call last):
    File "<stdin>", line 1, in <module>
    File "<stdin>", line 2, in add
  TypeError: can only concatenate str (not "int") to str

Python will not generally perform implicit conversions between types.

Scopes
------

- Type declarations are unnecessary in Python.
- Names can be rebound as necessary to objects of any type.
- Name resolution to objects is managed by scopes and scoping rules.

Scopes in Python
^^^^^^^^^^^^^^^^

(LEGB)

- **L** ocal - Inside the current function
- **E** nclosing - Inside enclosing functions
- **G** lobal - At the tope level of the module
- **B** uilt-in - In the special builtins module

Scopes in python don't correspond source code blocks

Rebinding Global Names
^^^^^^^^^^^^^^^^^^^^^^
