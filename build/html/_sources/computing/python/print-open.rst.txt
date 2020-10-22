Print & Open
============

For Loops
---------

https://www.kite.com/python/answers/how-to-iterate-through-the-lines-of-a-file-in-python#:~:text=Use%20a%20for%2Dloop%20to,line%20break%20from%20each%20line.

.. code-block:: python

  with open("sample.txt", "r") as a_file:
  for line in a_file:
    stripped_line = line.strip()
    print(stripped_line)

If Statements
-------------

https://stackabuse.com/python-check-if-string-contains-substring/

.. code-block:: python

  substring = "caleb"
  fullstring = "calebsargeant"

  if substring in fullstring:
      print("fullstring contains substring")
  else:
      print("fullstring does not contain substring")

https://www.w3schools.com/python/python_conditions.asp

.. code-block:: python

  a = 200
  b = 33
  if b > a:
    print("b is greater than a")
  elif a == b:
    print("a and b are equal")
  else:
    print("a is greater than b")

https://stackoverflow.com/questions/5899497/how-can-i-check-the-extension-of-a-file

.. code-block:: python

  if file.endswith('.docx'):
    print("it's a document")
  elif file.endswith('.xlsx'):
    print("it's a spreadsheet")
  else:
    print("whatever")

Redirect Output to File
-----------------------

https://stackoverflow.com/questions/7152762/how-to-redirect-print-output-to-a-file-using-python

https://stackoverflow.com/questions/36571560/directing-print-output-to-a-txt-file

Using open to output to file. ``a`` appends and ``w`` writes.

.. code-block:: python

  # print into a file
  with open(filename, "a") as f:
    print(myvar.strip(), file=open(f), "a")

  # Similarly, showing py2 vs py3
  with open('output.txt', 'w') as f:
    print >> f, 'Filename:', filename     # Python 2.x
    print('Filename:', filename, file=f)  # Python 3.x

Redirecting ``stdout`` to file, but printing directly to file is better:

.. code-block:: python

  import sys

  orig_stdout = sys.stdout
  f = open('out.txt', 'w')
  sys.stdout = f

  for i in range(2):
    print 'i = ', i

  sys.stdout = orig_stdout
  f.close()

Searching a File
----------------

https://www.kite.com/python/answers/how-to-search-a-file-using-grep-in-python

.. code-block:: python

  file = open("grep_sample.txt", "w")

  file.write("first line\nsecond line\nthird line")
  file.close()

  pattern = "second"

  file = open("grep_sample.txt", "r")
  for line in file:
      if re.search(pattern, line):
          print(line)

CSV Files
---------

It's easier to just iterate a file using ``csv.reader`` without going ``for row in reader`` and ``for column in row``.

https://stackoverflow.com/questions/49266463/read-csv-file-in-python-and-iterate-each-line-item-as-a-value-in-a-script/49266632

.. code-block:: python

  # Iterate over flat-file list OR a single column CSV file, header row cannot exist, or will be included as value to iterate over.
  with open(foodlist, 'r') as food:
    for (veg,) in csv.reader(food, delimiter=','):
      veg = veg.strip()
      print(veg)

  # Iterate over a CSV file with more than one column, specifying header row values:
  with open(foodlist, 'r') as food:
    for (veg, fruit, protein) in csv.reader(food, delimiter=','):
      veg = veg.strip()
      print(veg)

  # Iterate over a CSV file with more than one column, not caring about other header row values:
  with open(foodlist, 'r') as food:
    for (veg, _, _) in csv.reader(food, delimiter=','):
      veg = veg.strip()
      print(veg)

https://www.programiz.com/python-programming/reading-csv-files

.. code-block:: python

    import csv
    with open('my.csv', 'r') as file:
        reader = csv.reader(file)
        for row in reader:
            print(row)

https://stackoverflow.com/questions/45947887/python-looping-through-csv-files-and-their-columns

.. code-block:: python

  for i in numFiles:
    file = open(os.path.join(pathName, i), "rU")
    reader = csv.reader(file, delimiter=',')
    for row in reader:
        for column in row:
            print(column)
            if column=="SPECIFIC VALUE":
                #do stuff
