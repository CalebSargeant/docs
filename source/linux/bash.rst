####
Bash
####

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

.. code-block:: bash

  # yyyymmdd
  date +%Y%m%d

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
