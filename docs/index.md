---
# The <title> of the home page, which Material otherwise sets to the bare site name.
# Search results show it as the link text, so it says what is here.
title: Networking, cloud and Linux notes
---

# Caleb Sargeant's Docs

Technical how-to guides, runbooks, study notes and the things worth writing down
once so they need not be worked out twice. Networking, cloud, Linux, containers
and the automation that holds them together.

Everything here is a working note rather than a polished manual. Some of it is
current, some of it is a record of how a thing worked at the time.

<div class="grid cards" markdown>

- :material-lan: **[Networking](networking/cisco/index.md)**

    Cisco routing, switching, security and MPLS, plus MikroTik, FortiGate,
    Juniper, HP and UniFi.

- :material-server: **[Computing](computing/cloud/index.md)**

    Cloud, Linux, Docker, Kubernetes, Terraform, Ansible, ELK, Jenkins and
    pentesting notes.

- :material-code-braces: **[Programming](programming/python/index.md)**

    Python, from the fundamentals through to the bits that keep catching me out,
    and Bash.

- :material-dots-horizontal: **[Other](other/general/index.md)**

    APIs, iperf and everything that did not fit elsewhere.

</div>

## About

I have worked in IT since 2012, with a bias towards network security and
open-source tooling.

- Website: [calebsargeant.com](https://calebsargeant.com/)
- GitHub: [github.com/CalebSargeant](https://github.com/CalebSargeant)
- LinkedIn: [linkedin.com/in/calebsargeant](https://www.linkedin.com/in/calebsargeant)

![Caleb Sargeant](_images/profile-pic.jpg){ .portrait }

## For agents

Everything here is also published for AI assistants to read without scraping:

- [`llms.txt`](https://docs.calebsargeant.com/llms.txt) lists every page with a
  one-line summary, and [`llms-full.txt`](https://docs.calebsargeant.com/llms-full.txt)
  carries all of them as one markdown file.
- [mcp.calebsargeant.com](https://mcp.calebsargeant.com/) is a public, read-only MCP
  server that searches these pages and [calebsargeant.com](https://calebsargeant.com/)
  together. No sign-in:
  `claude mcp add --transport http calebsargeant https://mcp.calebsargeant.com/`

## A note on the lab files

The pages that came with downloadable lab archives, GNS3 projects and course
PDFs still link to them, but those files are served from the
[repository](https://github.com/CalebSargeant/docs) rather than from this site.
Together they run to roughly 700 MB, with single files past 80 MB, which is more
than a static host will take. The links work the same way; only the bytes come
from somewhere else.
