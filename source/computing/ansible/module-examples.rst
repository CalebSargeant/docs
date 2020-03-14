Module Examples
===============

lineinfile
----------

.. code-block:: yaml

  - name: Create ANAME records for all safe search
    lineinfile:
      path: /tmp/test.txt
      line: "{{ item.line }}"
    with_items:
      - { line: 'host-record=forcesafesearch.google.com,216.239.38.120' }
      - { line: 'host-record=safe.duckduckgo.com,54.241.17.246' }
      - { line: 'host-record=restrict.youtube.com,216.239.38.120' }
      - { line: 'host-record=strict.bing.com,204.79.197.220' }
      - { line: 'host-record=safesearch.pixabay.com,176.9.158.70' }

  - name: Create CNAME records for various search engines
    lineinfile:
      path: /tmp/test.txt
      line: "{{ item.line }}"
    with_items:
      - { line: 'cname=www.youtube.com,restrict.youtube.com' }
      - { line: 'cname=m.youtube.com,restrict.youtube.com' }
      - { line: 'cname=youtubei.googleapis.com,restrict.youtube.com' }
      - { line: 'cname=youtube.googleapis.com,restrict.youtube.com' }
      - { line: 'cname=www.youtube-nocookie.com,restrict.youtube.com' }
      - { line: 'cname=duckduckgo.com,www.duckduckgo.com,start.duckduckgo.com,safe.duckduckgo.com' }
      - { line: 'cname=duck.com,www.duck.com,safe.duckduckgo.com' }
      - { line: 'cname=bing.com,www.bing.com,strict.bing.com' }
      - { line: 'cname=pixabay.com,safesearch.pixabay.com' }

shell
-----

.. code-block:: yaml

  - name: Google test
    shell: "echo cname={{ item }},www.{{ item }},forcesafesearch.google.com >> /tmp/test.txt"
    with_items:
      - "{{ my_items.stdout_lines }}"
