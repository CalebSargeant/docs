Objects and Types
=================

Passing Arguments and Returning Values
--------------------------------------

Argument Passing
^^^^^^^^^^^^^^^^

When we pass an object reference to a function, we're essentially assigning from an actual argument reference, in this case ``m`` to the formal argument reference, in this case ``k``. Assignment causes the reference being assigned to being referred **to** the same object as the reference being assigned **from**, which is what's going on here:

.. code-block::

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

.. code-block::

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

.. code-block::

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

.. code-block::

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
