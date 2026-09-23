---
title: Ask an AI about these notes, or about me
description: Point Claude, Claude Code, Codex or ChatGPT at mcp.calebsargeant.com, a public, read-only MCP server over these docs and calebsargeant.com, or ask Nievah on the page.
---

# Ask an AI

Everything on this site, and my CV on [calebsargeant.com](https://calebsargeant.com/),
is published for AI assistants as well as for people. There are two ways to use
that: ask the assistant on this page, or connect your own.

## Ask Nievah, here

Nievah is the assistant behind the button at the bottom right of every page. She
is the Magma Moose assistant, so she answers from my CV, these notes and the Magma
Moose site. She says she is an AI, she only knows what is published, and there is
nothing to set up.

## Connect your own assistant

[mcp.calebsargeant.com](https://mcp.calebsargeant.com/) is a public, read-only MCP
server over Streamable HTTP: no sign-in and nothing to install. It searches every
page here and calebsargeant.com (the CV, every role in full, education, courses and
skills), and it cannot see anything that is not published. The address is the same
in every client:

```text
https://mcp.calebsargeant.com/
```

These are the steps each product documents today.

### Claude

On claude.ai and in the desktop app:

1. Open **Customize**, then **Connectors**.
2. Choose **+**, then **Add custom connector**.
3. Paste the address and choose **Add**.
4. In a chat, switch it on from the **+** menu, under **Connectors**.

The Free plan allows one custom connector. On Team and Enterprise an owner adds it
first, under **Organization settings**.

### Claude Code

```bash
claude mcp add --transport http calebsargeant https://mcp.calebsargeant.com/
```

Then run `/mcp` in a session to see it connected.

### Codex

```bash
codex mcp add calebsargeant --url https://mcp.calebsargeant.com/
```

or, in `~/.codex/config.toml`:

```toml
[mcp_servers.calebsargeant]
url = "https://mcp.calebsargeant.com/"
```

The Codex CLI, the IDE extension and the ChatGPT desktop app share this
configuration, so either one covers all three.

### ChatGPT

On the web, on a Plus, Pro, Business, Enterprise or Edu plan: turn on
**Developer mode** under **Settings**, **Security and login**, then add a
developer-mode app with the address above and no authentication.

### Anything else

Any client that speaks MCP over Streamable HTTP can use the same address, with no
authentication.

## Then ask

About these notes:

- Using the calebsargeant MCP server, how is a MikroTik IPsec tunnel to an AWS
  Site-to-Site VPN set up?
- What do Caleb's notes say about Docker Swarm?

About me, with a job description in hand:

- Using the calebsargeant MCP server, compare Caleb Sargeant with this job
  description. Where does he fit, and where would he need to grow? [paste the job
  description]
- What has Caleb done with Kubernetes and Terraform, and in which roles?

Ask where I fall short as well as where I fit; that half is usually the more
useful one.

## Magma Moose

For the tools Magma Moose builds, `mcp.magmamoose.com` does the same for their
documentation, and [docs.magmamoose.com](https://docs.magmamoose.com/) has every
public docs site. [magmamoose.com](https://www.magmamoose.com/services/) is where to
start if you are hiring a team rather than a person.
