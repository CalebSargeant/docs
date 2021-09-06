Requests
========

https://stackoverflow.com/questions/43938742/python-requests-upload-file

.. code-block:: python

  #!/usr/bin/env python3

  import requests

  url = 'https://EXAMPLE'

  payload = {
    'one': 'EXAMPLE',
    'two': 'EXAMPLE',
    'three': 'EXAMPLE'
    }

  files = {
    'doc': ('example.docx', open('/Path/to/example.docx', 'rb'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    }

  r = requests.post(url, data=payload, files=files)

  print(r.json())
