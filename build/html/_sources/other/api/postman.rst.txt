Postman
=======

Postman allows you to send RESTAPI calls to any endpoint and can save them as bookmarks (postman calls them collections).

Device Login
------------

An example device login POST request:
URL: https://{{host}}/api/aaaLogin.json

Body:

.. code-block:: json

  {
    "aaaUser": {
      "attributes": {
        "name": "{{username}}",
        "pwd": "{{password}}"
      }
    }
  }
