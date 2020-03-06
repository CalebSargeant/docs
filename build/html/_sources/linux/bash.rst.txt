####
Bash
####

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
