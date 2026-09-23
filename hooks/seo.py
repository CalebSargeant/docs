"""Build-time SEO for docs.calebsargeant.com: page descriptions and security.txt.

A MkDocs hook (``hooks:`` in mkdocs.yml) rather than a plugin, because there is nothing
to install: MkDocs imports this file and calls the functions below by name.

``on_page_markdown``
    Gives every page its own ``<meta name="description">``. Material falls back to
    ``site_description`` for any page without a ``description:`` in its front matter,
    and none of the 246 pages converted from Sphinx has one, so every page on the site
    advertised the same sentence. Search engines treat that as duplicate metadata and
    write their own snippet from whatever they find first, which on these pages is
    usually navigation. The first real paragraph of the page is a better description
    than either, and it is already written.

``on_page_context``
    Hands ``overrides/main.html`` the Open Graph values and a JSON-LD graph for the page.
    Material emits neither without its social plugin, which needs Cairo and Pillow in CI
    to render a card per page. The graph names the Person node calebsargeant.com already
    publishes (by ``@id``), so a crawler attaches these pages to the entity it knows
    instead of inventing a second Caleb Sargeant. Every page but the home page also gets a
    BreadcrumbList, which is what lets a result show its section path instead of a bare
    URL. Built here with ``json.dumps`` rather than in Jinja, because hand-assembled JSON
    in a template is one stray quote in a page title away from a graph no crawler can
    parse.

``on_post_page``
    Writes each page's markdown beside its HTML as ``<page>/index.md``, the "same URL
    with .md" copy llmstxt.org asks for. A Transform Rule on the zone serves it for a
    request that asks for ``Accept: text/markdown``, and docs/_headers links the pair
    both ways (canonical on the copy, alternate on the page), the same arrangement as
    calebsargeant.com. It is the page's source, not a conversion of the HTML: these
    pages were written as markdown, so that is the cleanest version there is.

``on_post_build``
    Writes ``/.well-known/security.txt`` (RFC 9116) with an ``Expires`` computed at
    build time. calebsargeant.com keeps its copy by hand and says so, because an expired
    security.txt is worse than none. Here any deploy refreshes it instead, and the docs
    deploy on every change to ``docs/``, Dependabot's monthly bumps included. It is
    written straight into the built site rather than kept under ``docs/``, because
    MkDocs excludes dot-directories from ``docs_dir`` by default and a generated file
    has no business in the source tree. The two agent-discovery catalogs are written the
    same way and for the same reason: an AI Catalog and an RFC 9727 API catalog, both
    pointing at the MCP server that searches these pages.
"""

from __future__ import annotations

import html
import json
import re
from datetime import UTC, datetime
from pathlib import Path

#: Where Google and Bing cut a description off in a result. A longer one is not an
#: error, just a sentence that ends in an ellipsis nobody chose.
DESCRIPTION_CHARS = 155

#: A "paragraph" shorter than this is a label ("Notes:", "Example") rather than a
#: summary, and the next block is tried instead.
MIN_PARAGRAPH_CHARS = 60

CONTACT = "mailto:contact@calebsargeant.com"

#: The Person node calebsargeant.com publishes in its own JSON-LD. Same @id, same entity.
PERSON = {
    "@type": "Person",
    "@id": "https://calebsargeant.com/#person",
    "name": "Caleb Sargeant",
    "url": "https://calebsargeant.com/",
    "image": "https://calebsargeant.com/assets/img/caleb.jpg",
    "sameAs": [
        "https://github.com/CalebSargeant",
        "https://www.linkedin.com/in/calebsargeant/",
        "https://www.credly.com/users/calebsargeant/badges",
        "https://www.udemy.com/user/caleb-sargeant/",
    ],
}

#: The MCP server that searches these pages, and its Server Card (SEP-2127), which lives
#: with the server at the location the extension reserves.
MCP_ENDPOINT = "https://mcp.calebsargeant.com/"
MCP_CARD = f"{MCP_ENDPOINT}server-card"

#: The 1200x630 card calebsargeant.com renders for itself. The same person and the same
#: design, so borrowing it is truer than a generic card per page.
OG_IMAGE = "https://calebsargeant.com/assets/og/og-default.png"


def _plain(markdown: str) -> str:
    """Flatten inline markdown to text. Approximate on purpose: it feeds one meta tag."""
    # An escaped asterisk is a literal one, which in these notes is a bullet written inline
    # (`\* DNS attacks ... \* 200 billion ...`). Made a separator before the emphasis rule
    # below can pair two of them up and leave their backslashes behind.
    text = markdown.replace("\\*", "·")
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)  # images, before links
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)  # inline links
    text = re.sub(r"`{1,3}([^`]*)`{1,3}", r"\1", text)  # code spans
    text = re.sub(r"\*{1,3}([^*]+)\*{1,3}", r"\1", text)  # emphasis
    text = re.sub(r"(?<![\w])_{1,3}([^_]+)_{1,3}(?![\w])", r"\1", text)
    text = re.sub(r"\{[^}]*\}", "", text)  # attr_list, e.g. `{ .portrait }`
    text = re.sub(r"<[^>]+>", "", text)  # inline HTML
    text = re.sub(r":[a-z0-9_-]+:", "", text)  # :material-lan: and friends
    text = re.sub(r"\\\n", " ", text)  # pandoc's hard line break: a backslash at the end of a line
    text = re.sub(r"\\([^\w\s])", r"\1", text)  # pandoc's escaped punctuation, e.g. \<
    return re.sub(r"\s+", " ", text).strip()


def _is_prose(text: str) -> bool:
    """Enough real words to describe a page, rather than a filename, a label or a command."""
    words = text.split()
    if len(words) < 6 or len(text) < MIN_PARAGRAPH_CHARS:
        return False
    wordy = sum(1 for w in words if re.fullmatch(r"[A-Za-z][A-Za-z'’(),.;:-]*", w))
    return wordy / len(words) >= 0.7


def first_paragraph(markdown: str) -> str:
    """The first block of prose after the title, skipping headings, tables, lists and code.

    Fences are stripped even when indented: pandoc put many of them inside list items,
    and an unstripped one turns `>>> x = 1` into a meta description.
    """
    body = re.sub(r"^[ \t]*(```|~~~).*?^[ \t]*\1[^\n]*$", "", markdown, flags=re.S | re.M)
    body = re.sub(r"^#\s+.+?$", "", body, count=1, flags=re.M)
    for block in re.split(r"\n\s*\n", body):
        if block.startswith(("    ", "\t")):
            continue  # an indented code block, or a continuation of a list item
        # A blockquote is judged by what it quotes: `> - kubectl ...` is still a list.
        candidate = re.sub(r"^>\s?", "", block.strip(), flags=re.M).strip()
        if not candidate or candidate.startswith(("#", "|", "---", "===", "<", "![", "!!!", "???", "- ", "* ", "+ ")):
            continue
        if re.match(r"\d+[.)] ", candidate):
            continue
        text = _plain(candidate)
        if _is_prose(text):
            return text
    return ""


def clip(text: str, limit: int = DESCRIPTION_CHARS) -> str:
    """Cut at a word boundary, and say so with an ellipsis."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,;:.")
    return f"{cut}…"


#: Descriptions already given out in this build, so no two pages share one. Reset per
#: build, because `mkdocs serve` rebuilds in the same process.
_used: set[str] = set()


def on_pre_build(config):  # noqa: ARG001 - MkDocs' hook signature
    _used.clear()


def _fallback(page) -> str:
    """No usable prose: the page's own title and the section it sits in. Unique, because
    the titles are. A section's own index page names the section above it instead of
    repeating itself."""
    parents = [s.title for s in page.ancestors if getattr(s, "title", None) and s.title != page.title]
    where = f"{parents[0]} notes" if parents else "notes"
    return f"{page.title}: {where} in Caleb Sargeant's technical documentation."


def on_page_markdown(markdown, page, config, files):  # noqa: ARG001 - MkDocs' hook signature
    if page.meta.get("description"):
        return markdown
    if page.is_homepage:
        summary = config.get("site_description") or ""
    else:
        summary = first_paragraph(markdown)
        if clip(summary) in _used:
            # Several Sphinx pages open with the same boilerplate sentence. The first keeps
            # it; the rest get a description that says which page they are.
            summary = ""
    text = clip(summary or _fallback(page))
    _used.add(text)
    # Material prints page.meta.description into `content="..."` without escaping (MkDocs
    # runs Jinja with autoescape off), so a quote in the prose would end the attribute.
    # Escaped once, here; the raw text travels beside it for the JSON-LD.
    page.meta["description"] = html.escape(text, quote=True)
    page.meta["description_text"] = text
    return markdown


def breadcrumbs(page, site_url: str, site_name: str) -> dict:
    """The page's place in the nav as a BreadcrumbList, which search results show as its path.

    Home, then every ancestor section that has a landing page, then the page itself. A
    section without an index.md has no URL to point at, and Google wants an ``item`` on every
    crumb but the last, so such a section is left out rather than named without a link.
    """
    crumbs = [(site_name, site_url)]
    for section in reversed(page.ancestors):
        index = next((c for c in section.children if getattr(c, "is_index", False)), None)
        if index is not None and index is not page:
            crumbs.append((section.title, index.canonical_url))
    crumbs.append((page.title, page.canonical_url))
    return {
        "@type": "BreadcrumbList",
        "@id": f"{page.canonical_url}#breadcrumb",
        "itemListElement": [
            {"@type": "ListItem", "position": n, "name": name, "item": url}
            for n, (name, url) in enumerate(crumbs, start=1)
        ],
    }


def on_page_context(context, page, config, nav):  # noqa: ARG001 - MkDocs' hook signature
    site_url = config.get("site_url") or ""
    url = page.canonical_url or site_url
    title = config["site_name"] if page.is_homepage else page.title
    # Raw text for JSON-LD (json.dumps escapes it); the attribute-safe form for the tags.
    description = page.meta.get("description_text") or html.unescape(
        page.meta.get("description") or config.get("site_description") or ""
    )
    website = {
        "@type": "WebSite",
        "@id": f"{site_url}#website",
        "url": site_url,
        "name": config["site_name"],
        "description": config.get("site_description") or "",
        "inLanguage": "en",
        "author": {"@id": PERSON["@id"]},
        "publisher": {"@id": PERSON["@id"]},
    }
    graph = [website, PERSON]
    if not page.is_homepage:
        trail = [s.title for s in reversed(page.ancestors) if getattr(s, "title", None)]
        article = {
            "@type": "TechArticle",
            "@id": f"{url}#article",
            "url": url,
            "headline": title,
            "description": description,
            "inLanguage": "en",
            "author": {"@id": PERSON["@id"]},
            "publisher": {"@id": PERSON["@id"]},
            "isPartOf": {"@id": website["@id"]},
            "mainEntityOfPage": url,
        }
        if trail:
            article["articleSection"] = " / ".join(trail)
        crumbs = breadcrumbs(page, site_url, config["site_name"])
        article["breadcrumb"] = {"@id": crumbs["@id"]}
        graph += [article, crumbs]
    context["seo"] = {
        "type": "website" if page.is_homepage else "article",
        "title": title,
        "description": html.escape(description, quote=True),
        "url": url,
        "twin": f"{url}index.md",
        "image": OG_IMAGE,
        # `<` escaped so no page title can close the script element early.
        "jsonld": json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False).replace(
            "<", "\\u003c"
        ),
    }
    return context


def twin_text(markdown: str, url: str) -> str:
    """The page's markdown with one line saying where it is published, under its H1."""
    note = f"> Markdown source of <{url}>."
    first, _, rest = markdown.lstrip("\n").partition("\n")
    if first.startswith("# "):
        return f"{first}\n\n{note}\n{rest}"
    return f"{note}\n\n{markdown}"


def on_post_page(output, page, config):
    # Directory URLs only: every page here is one, and a copy of a page rendered to a
    # flat foo.html would need a different URL rule than the zone's Transform Rule has.
    if page.file.dest_uri.endswith("index.html") and page.markdown:
        target = Path(config["site_dir"]) / page.file.dest_uri[: -len("index.html")] / "index.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(twin_text(page.markdown, page.canonical_url), encoding="utf-8")
    return output


def ai_catalog() -> dict:
    """An AI Catalog (github.com/Agent-Card/ai-catalog) listing the MCP server's card.

    The same entry calebsargeant.com and mcp.calebsargeant.com publish: one server,
    whichever of the three domains an agent starts from.
    """
    return {
        "specVersion": "1.0",
        "host": {
            "displayName": "Caleb Sargeant",
            "identifier": "calebsargeant.com",
            "documentationUrl": "https://docs.calebsargeant.com/llms.txt",
            "logoUrl": "https://calebsargeant.com/assets/icon-192.png",
        },
        "entries": [
            {
                "identifier": "urn:air:calebsargeant.com:mcp:calebsargeant",
                "displayName": "Caleb Sargeant",
                "type": "application/mcp-server-card+json",
                "url": MCP_CARD,
                "description": "Public, read-only MCP server over Caleb Sargeant's CV, website and technical docs.",
                "tags": ["networking", "cisco", "security", "cloud", "linux", "kubernetes", "documentation"],
                "representativeQueries": [
                    "How do I secure the management plane on a Cisco router?",
                    "Find notes on installing Kubernetes",
                    "What does Caleb Sargeant's documentation say about Terraform?",
                    "Show me a runbook for configuring a FortiGate VPN",
                ],
            }
        ],
    }


def api_catalog(site_url: str) -> dict:
    """RFC 9727: the MCP server as the API, its card as the machine-readable description."""
    return {
        "linkset": [
            {
                "anchor": f"{site_url}/.well-known/api-catalog",
                "item": [{"href": MCP_ENDPOINT, "title": "calebsargeant: a public, read-only MCP server over these pages"}],
            },
            {
                "anchor": MCP_ENDPOINT,
                "service-desc": [{"href": MCP_CARD, "type": "application/mcp-server-card+json"}],
                "service-doc": [{"href": MCP_ENDPOINT, "type": "text/html"}],
            },
        ]
    }


def security_expiry(now: datetime) -> datetime:
    """The first day of the month eleven months after ``now``: always under RFC 9116's year."""
    month = now.month - 1 + 11
    return datetime(now.year + month // 12, month % 12 + 1, 1, tzinfo=UTC)


def on_post_build(config):
    site_url = (config.get("site_url") or "").rstrip("/")
    expires = security_expiry(datetime.now(UTC))
    body = "\n".join(
        [
            "# Vulnerability disclosure for docs.calebsargeant.com, RFC 9116.",
            "#",
            "# Generated by hooks/seo.py on every build, so Expires moves forward with each deploy.",
            "# The same contact as calebsargeant.com and mcp.calebsargeant.com. The site is static",
            "# documentation with nothing to sign in to and no bug bounty.",
            f"Contact: {CONTACT}",
            f"Expires: {expires:%Y-%m-%dT%H:%M:%S}.000Z",
            "Preferred-Languages: en",
            f"Canonical: {site_url}/.well-known/security.txt",
            "",
        ]
    )
    wellknown = Path(config["site_dir"]) / ".well-known"
    wellknown.mkdir(parents=True, exist_ok=True)
    (wellknown / "security.txt").write_text(body, encoding="utf-8")
    # Media types and CORS for these two come from docs/_headers; api-catalog has no
    # extension to take one from.
    (wellknown / "ai-catalog.json").write_text(json.dumps(ai_catalog(), indent=2) + "\n", encoding="utf-8")
    (wellknown / "api-catalog").write_text(json.dumps(api_catalog(site_url), indent=2) + "\n", encoding="utf-8")
