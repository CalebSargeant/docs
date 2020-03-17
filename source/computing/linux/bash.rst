Bash
====

.. code-block:: bash

  nano filename.sh
    #!/bin/bash
    myscriptcontent
  chmod u+x filename.sh

Associative Arrays
------------------

https://clubmate.fi/associative-arrays-in-bash/

.. code-block:: bash

  declare -A names=(
  [caleb]=sargeant
  [network]=guru
  )

  for i in "${!names[@]}"
  do
    first_name=$i
    last_name=${names[$i]}
    echo "$first_name : $last_name"
  done

Getopt
------

.. code-block:: bash

  # Execute getopt for arguments to be passed to script, identified by "$@"
  PARSED_OPTIONS=$(getopt -n "$0" -o hfi: --long "help,file,input:" -- "$@")

  # Bad arguments or something wrong with getopt
  if [ $? -ne 0 ]; then
    exit 1
  fi

  # getopt juju
  eval set -- "$PARSED_OPTIONS"

  # go through each option and use shift to analyse 1 argument at a time, discarding $1, making $2 $1, etc.
  while true;
  do
    case "$1" in
      -h|--help)
        echo "usage $0 -h -f -i or $0 --help --file --input"
        shift;;

      -f|--file)
        echo "file"
        shift;;

      -i|--input)
      echo "input"

        if [ -n "$2" ]; then
          echo "Arguement: $2"
        fi
        shift 2;;

      --)
      shift
      break;;
    esac
  done

sed
---

.. code-block:: bash

  # Removes all comments including those with tabs and spaces
  sed -e '/^[ \t\n]*#/d'

  # Replacing Text (in this case remove ")
  sed 's/"//g'

  # Delete first line
  sed -i -e 1d

awk
---

.. code-block:: bash

  # Print the first column using "," as separator
  awk -F "," '{print $1}'

date
----

https://www.tutorialkart.com/bash-shell-scripting/bash-date-format-options-examples/

.. code-block:: bash

  # yyyymmdd
  date +%Y%m%d

cut
---

.. code-block:: bash

  # Remove the filename extension (eg. ".exe")
  name=$(echo "$filename" | cut -f 1 -d '.')

Prompt for Input
----------------

Using ``read``

* Simple & common

.. code-block:: bash

  while true; do
    read -p "Do you wish to install this program?" yn
      case $yn in
        [Yy]* ) make install; break;;
        [Nn]* ) exit;;
      * ) echo "Please answer yes or no.";;
    esac
  done

Using ``select``

* No need to sanitize input
* Prompts you with choice you want
* Automatically loops (no need for ``while true`` loop to retry)

.. code-block:: bash

  echo "Do you wish to install this program?"
  select yn in "Yes" "No"; do
    case $yn in
      Yes ) make install; break;;
      No ) exit;;
    esac
  done

Output Formatting
-----------------

Source for more formatting options: http://misc.flogisoft.com/bash/tip_colors_and_formatting

.. code-block:: bash

  echo -e "\e[1mbold\e[0m"
  echo -e "\e[3mitalic\e[0m"
  echo -e "\e[4munderline\e[0m"
  echo -e "\e[9mstrikethrough\e[0m"
  echo -e "\e[31mHello World\e[0m"

While True Loop
---------------

https://unix.stackexchange.com/questions/193352/is-using-while-true-to-keep-a-script-alive-a-good-idea

.. code-block:: bash

  while true
  do
    echo my commands
    sleep 1
  done

For Loops
---------

Loop through directory names
https://unix.stackexchange.com/questions/86722/how-do-i-loop-through-only-directories-in-bash

.. code-block:: bash

  for d in */ ; do
    echo "$d"
  done

Loop through file names
https://stackoverflow.com/questions/10523415/execute-command-on-all-files-in-a-directory

.. code-block:: bash

  for file in /dir/* ; do
      cmd [option] "$file" >> results.out
  done

Arithmetic
----------

Bash is limited to integer math

Sum
^^^

**Adding all numbers from output**

https://stackoverflow.com/questions/450799/shell-command-to-sum-integers-one-per-line

.. code-block:: bash

  awk '{sum+=$0} END{print sum}'

Divide
^^^^^^

https://stackoverflow.com/questions/1088098/how-do-i-divide-in-the-linux-console

.. code-block:: bash

  x=10
  y=5

  # Don't enclose variables in quotes this time
  $ echo $(( $x / $y ))
  2

Scientific Notation & Rounding
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

https://stackoverflow.com/questions/8356698/how-to-remove-decimal-from-a-variable
https://unix.stackexchange.com/questions/104332/remove-scientific-notation-bash-script

.. code-block:: bash

  # Round & remove scientific notation (0f is the number of decimals)
  $ echo 2.123456 | awk '{ print sprintf("%.0f", $1); }'
  2

  # Round down
  $ printf %.0f 1.89
  2

Incrementing
^^^^^^^^^^^^

.. code-block:: bash

  $ echo $((n=n+1))
  1
  $ echo $((n=n+1))
  2

wc
---

Number of Lines
^^^^^^^^^^^^^^^

``wc -l myfile.txt``

Number of Words
^^^^^^^^^^^^^^^

``wc -w myfile.txt``

Number of Characters
^^^^^^^^^^^^^^^^^^^^

``wc -m myfile.txt``

Count Number of Lines of Output
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

https://unix.stackexchange.com/questions/72819/count-number-of-lines-of-output-from-previous-program

```command | tee >(wc -l)```

jq
---

https://stackoverflow.com/questions/52732473/how-to-pass-bash-variable-as-a-key-to-jq

Querying using a bash variable: ``jq ".$bash_var"``

ls
---

https://stackoverflow.com/questions/14352290/listing-only-directories-using-ls-in-bash

https://stackoverflow.com/questions/5168071/list-sub-directories-with-ls

List Directories: ``ls -d */``

https://stackoverflow.com/questions/7992689/how-to-loop-all-files-in-sorted-order-in-bash

Loop through sorted output: ``ls *.png | sort -V``

tr
---

Remove whitespace

https://stackoverflow.com/questions/369758/how-to-trim-whitespace-from-a-bash-variable

``| tr -d '[:space:]')``

pwd
---

https://stackoverflow.com/questions/1371261/get-current-directory-name-without-full-path-in-a-bash-script

.. code-block:: bash

  # Get current working directory as variable in bash
  $ result=${PWD##*/}
  $ echo $result
  caleb.sargeant

  # Using basename
  $ pwd
  /Users/caleb.sargeant
  $ basename $(pwd)
  caleb.sargeant

https://stackoverflow.com/questions/8426058/getting-the-parent-of-a-directory-in-bash

.. code-block:: bash

  dir=/home/caleb.sargeant/Desktop/Test
  parentdir="$(dirname "$dir")"

cat
---

Be careful with quotation with ``cat``: https://stackoverflow.com/questions/12636170/bash-script-error-with-cat-and-if

tr
---

.. code-block:: bash

  $ echo __ | tr _ -
  --

if
---

Check if a file type exists in directory
https://stackoverflow.com/questions/3856747/check-whether-a-certain-file-type-extension-exists-in-directory

.. code-block:: bash

  count=$(ls -1 *.json 2>/dev/null | wc -l)
  if [ $count != 0 ]; then
    echo true
  fi

Remove First Line
-----------------

https://superuser.com/questions/284258/remove-first-line-in-bash

Search for Text in Files
------------------------

``grep -rnw '/etc/' -e 'NULL'``
