#!/usr/bin/env python3
"""One-shot migration: Sphinx/RST under source/ -> MkDocs Markdown under docs/.

Pandoc does the body (headings, lists, tables, inline markup, code blocks); this
script owns everything Pandoc cannot know about:

  * Sphinx roles   :download: :ref: :code: :file:
  * `raw:: html` substitutions (|name|)
  * .. toctree::   -> the MkDocs nav, including :glob: expansion
  * pandoc's ::: fenced divs -> Material `!!!` admonitions

Emits docs/ plus a nav tree printed as YAML for mkdocs.yml (see build-nav.py).

KEPT AS A RECORD, NOT AS A DEPENDENCY. It ran once, in the commit that moved this
repository off Sphinx, and nothing builds or publishes through it now. It is here
because that commit changed four thousand files mechanically: the rules below are
the reviewable part of that diff, and if a conversion defect surfaces later this
is what gets corrected and re-run rather than 246 pages edited by hand.

    PANDOC=./pandoc RST_SRC=source MD_OUT=docs python3 tools/rst-to-markdown.py
    python3 tools/build-nav.py
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get("RST_SRC", ROOT / "source"))
OUT = Path(os.environ.get("MD_OUT", ROOT / "docs"))
PANDOC = os.environ.get("PANDOC", "pandoc")

# ---------------------------------------------------------------- helpers


def slug(text: str) -> str:
    """Match MkDocs' (Python-Markdown toc) slugify for anchor links."""
    text = re.sub(r"[^\w\s-]", "", text.strip().lower())
    return re.sub(r"[-\s]+", "-", text)


def title_of(rst: str) -> str:
    """First section title in an RST document."""
    lines = rst.splitlines()
    for i, line in enumerate(lines[:-1]):
        nxt = lines[i + 1]
        if (
            line.strip()
            and len(nxt) >= len(line.strip())
            and len(set(nxt.strip())) == 1
            and nxt.strip()[0] in '=-~^"#*+`\':.'
            and not line.startswith("..")
        ):
            return line.strip()
    return ""


# ---------------------------------------------------------------- pre-process


SUBST_RAW = re.compile(
    r"^\.\. \|([^|]+)\| raw:: html\s*\n\n?((?:^[ \t]+.*\n|^\s*\n)*)", re.M
)
ANCHOR = re.compile(r"<a\s+href=\"([^\"]+)\"[^>]*>(.*?)</a>", re.S | re.I)


def inline_substitutions(rst: str) -> str:
    """`.. |x| raw:: html` + `|x|` -> a plain RST link, which pandoc understands."""
    repl: dict[str, str] = {}

    def take(m: re.Match[str]) -> str:
        name, body = m.group(1), m.group(2)
        a = ANCHOR.search(body)
        if a:
            href, text = a.group(1), re.sub(r"\s+", " ", a.group(2)).strip()
            repl[name] = f"`{text} <{href}>`_"
        else:
            repl[name] = re.sub(r"<[^>]+>", "", body).strip()
        return ""

    rst = SUBST_RAW.sub(take, rst)
    for name, value in repl.items():
        rst = rst.replace(f"|{name}|", value)
    return rst


DOWNLOAD_TEXT = re.compile(r":download:`\s*([^`<]*?)\s*<([^`>]+)>\s*`", re.S)
DOWNLOAD_BARE = re.compile(r":download:`\s*([^`<>]+?)\s*`")
# The corpus carries both `:ref:` and a stray `::ref:` typo.
REF_TEXT = re.compile(r":{1,2}ref:`\s*([^`<]*?)\s*<([^`>]+)>\s*`")
REF_BARE = re.compile(r":{1,2}ref:`\s*([^`<>]+?)\s*`")
CODE_ROLE = re.compile(r":(?:code|file):`([^`]+)`")


def _download_link(m: re.Match[str]) -> str:
    text = re.sub(r"\s+", " ", m.group(1)).strip()
    href = m.group(2).strip()
    return "`{} <{}>`_".format(text or Path(href).name, href)


def roles(rst: str) -> str:
    """Sphinx roles -> ordinary RST that pandoc renders correctly."""
    # :download:`Text <path>` / :download:`path`
    rst = DOWNLOAD_TEXT.sub(_download_link, rst)
    rst = DOWNLOAD_BARE.sub(
        lambda m: f"`{Path(m.group(1)).name} <{m.group(1)}>`_", rst
    )
    # :ref:`Text <Target>` -> an in-page anchor link. These all point at section
    # titles in the same document, which is what Sphinx was resolving them to.
    rst = REF_TEXT.sub(lambda m: f"`{m.group(1)} <#{slug(m.group(2))}>`_", rst)
    rst = REF_BARE.sub(lambda m: f"`{m.group(1)} <#{slug(m.group(1))}>`_", rst)
    rst = CODE_ROLE.sub(lambda m: f"``{m.group(1)}``", rst)
    return rst


# Sphinx layout options on an image. Pandoc cannot express them in GFM, so it falls
# back to a raw <img> carrying Sphinx CSS classes that Material does not define — and
# a raw <img> also escapes MkDocs' link validation, so a broken path stops being an
# error. Dropping them gets a plain ![](), which --strict then checks. The pixel widths
# were fixed-size anyway and would fight Material's responsive layout.
IMAGE_LAYOUT_OPTS = re.compile(r"^[ \t]+:(?:width|height|align|scale|class|figwidth):.*\n", re.M)
CODE_LANG_NONE = re.compile(r"^(\s*\.\. code(?:-block)?::)\s*none\s*$", re.M)


GRID_RULE = re.compile(r"^[ \t]*\+[-=+]{3,}\+[ \t]*$")
GRID_ROW = re.compile(r"^[ \t]*\|.*\|[ \t]*$")


def split_grid_rows(rst: str) -> str:
    """Give every line of a grid-table body its own row.

    The corpus' grid tables were written without the `+---+` rule between data
    lines, so docutils reads seven logical rows as one cell holding seven lines.
    Sphinx rendered that as one wrapped row and GFM cannot even do that — it has
    no in-cell line break, so the whole block collapses onto a single line. The
    author's intent is unambiguous from the alignment, so re-rule the body.
    """
    out: list[str] = []
    block: list[str] = []
    rule = ""

    def flush() -> None:
        if not block:
            return
        # Only re-rule where every line has the same cell boundaries AND every line
        # opens a new logical row. A blank leading cell marks a continuation line, so
        # the table really is using multi-line cells: splitting there would turn one
        # wrapped row into several rows with empty keys. Those fall through to
        # pandoc's own handling, which joins them.
        bars = {tuple(i for i, c in enumerate(line) if c == "|") for line in block}
        starts_row = all(line.split("|")[1].strip() for line in block)
        if len(bars) == 1 and len(block) > 1 and starts_row:
            for i, line in enumerate(block):
                out.append(line)
                if i != len(block) - 1:
                    out.append(rule)
        else:
            out.extend(block)
        block.clear()

    for line in rst.splitlines():
        if GRID_RULE.match(line):
            flush()
            rule = line.replace("=", "-")
            out.append(line)
        elif GRID_ROW.match(line) and rule:
            block.append(line)
        else:
            flush()
            rule = ""
            out.append(line)
    flush()
    return "\n".join(out) + ("\n" if rst.endswith("\n") else "")


# GFM has no fenced-div syntax, so pandoc drops an RST admonition's framing and emits
# only its body — the "note" disappears with nothing reported. Carrying the type across
# as a sentinel paragraph is the one way to get it back on the far side.
ADMONITION_BLOCK = re.compile(
    r"^([ \t]*)\.\. (note|warning|tip|caution|danger|important|attention|hint)::[ \t]*"
    r"(.*)\n((?:(?:\1[ \t]+.*)?\n)*)",
    re.M,
)
SENTINEL_OPEN = "XADMOXOPENX{}X"
SENTINEL_CLOSE = "XADMOXCLOSEX"


def admonition_sentinels(rst: str) -> str:
    def take(m: re.Match[str]) -> str:
        indent, kind, first, body = m.groups()
        lines = [first.strip()] if first.strip() else []
        for raw in body.splitlines():
            if raw.strip():
                lines.append(raw.strip())
        inner = "\n\n".join(lines)
        return (
            f"{indent}{SENTINEL_OPEN.format(kind.upper())}\n\n"
            f"{indent}{inner}\n\n{indent}{SENTINEL_CLOSE}\n\n"
        )

    return ADMONITION_BLOCK.sub(take, rst)


def directives(rst: str) -> str:
    rst = admonition_sentinels(rst)
    rst = IMAGE_LAYOUT_OPTS.sub("", rst)
    # `none` is not a Pygments lexer; `text` is the one that means the same thing.
    rst = CODE_LANG_NONE.sub(r"\1 text", rst)
    rst = split_grid_rows(rst)
    return rst


TOCTREE = re.compile(r"^([ \t]*)\.\. toctree::[ \t]*\n((?:\1[ \t]+.*\n|[ \t]*\n)*)", re.M)


def take_toctrees(rst: str, doc: Path) -> tuple[str, list[tuple[str, list[str]]]]:
    """Strip toctrees out of the body and return them as (caption, entries)."""
    found: list[tuple[str, list[str]]] = []

    def take(m: re.Match[str]) -> str:
        body = m.group(2)
        caption, entries, glob = "", [], False
        for raw in body.splitlines():
            line = raw.strip()
            if not line:
                continue
            if line.startswith(":caption:"):
                caption = line.split(":", 2)[2].strip()
            elif line == ":glob:":
                glob = True
            elif line.startswith(":"):
                continue
            else:
                entries.append(line)
        if glob:
            expanded: list[str] = []
            for entry in entries:
                if "*" in entry:
                    base = doc.parent
                    for p in sorted(base.glob(entry + ".rst")):
                        if p.stem != "index":
                            expanded.append(p.stem)
                    for p in sorted(base.glob(entry)):
                        if p.is_dir() and (p / "index.rst").exists():
                            expanded.append(f"{p.name}/index")
                else:
                    expanded.append(entry)
            entries = list(dict.fromkeys(expanded))
        found.append((caption, entries))
        return ""

    return TOCTREE.sub(take, rst), found


# ---------------------------------------------------------------- post-process

SENT_OPEN_RE = re.compile(r"^\s*XADMOXOPENX(\w+)X\s*$")
SENT_CLOSE_RE = re.compile(r"^\s*XADMOXCLOSEX\s*$")


def admonitions(md: str) -> str:
    """The sentinels planted before pandoc -> Material's `!!! note` blocks."""
    out: list[str] = []
    inside = False
    for line in md.splitlines():
        m = SENT_OPEN_RE.match(line)
        if m:
            out += [f"!!! {m.group(1).lower()}", ""]
            inside = True
            continue
        if inside and SENT_CLOSE_RE.match(line):
            inside = False
            out.append("")
            continue
        out.append(("    " + line) if inside and line.strip() else line)
    return "\n".join(out)


# Pandoc falls back to raw HTML for a figure (GFM has no <figure>) and for an RST
# internal hyperlink target (`.. _Label:`), which it emits as a wrapping <div id=...>.
RAW_IMG = re.compile(r"<img\s+src=\"([^\"]+)\"(?:\s+alt=\"([^\"]*)\")?[^>]*/?>")
RAW_DIV_OPEN = re.compile(r"^<div id=\"([^\"]+)\">\s*$", re.M)


def raw_html(md: str) -> str:
    def img(m: re.Match[str]) -> str:
        src, alt = m.group(1), (m.group(2) or "").strip()
        # docutils defaults a missing :alt: to the URI itself, which is no use to a
        # screen reader; fall back to the filename words as elsewhere.
        if not alt or alt == src:
            stem = Path(src).stem
            alt = re.sub(r"[-_]+", " ", re.sub(r"-?\d+$", "", stem)).strip() or "Diagram"
        return f"![{alt}]({src})"

    md = RAW_IMG.sub(img, md)
    # An empty anchor keeps the `:ref:` links resolving, without a stray <div> that
    # never closes cleanly around Markdown content.
    md = RAW_DIV_OPEN.sub(lambda m: f'<a id="{slug(m.group(1))}"></a>', md)
    md = re.sub(r"^</div>\s*$\n?", "", md, flags=re.M)
    # RST's default role is `title reference`; every use in this corpus is a command
    # or a filename, so code is the faithful reading, not docutils' italics. Non-greedy
    # rather than [^<]*, because the placeholders these wrap (`docker <command>`) reach
    # here backslash-escaped and would otherwise be skipped.
    md = re.sub(
        r'<span class="title-ref">(.*?)</span>',
        lambda m: "`" + re.sub(r"\\([<>\[\]*_`$])", r"\1", m.group(1)) + "`",
        md,
        flags=re.S,
    )
    return md


PLAIN_IMAGE = re.compile(r"!\[image\]\(([^)\s]+)([^)]*)\)")


def alt_text(md: str) -> str:
    """Pandoc alt-texts an option-less RST image as the literal word "image".

    The filenames are descriptive (`bgp-understanding-ibgp-vs-ebgp.png`), so they make
    a far better screen-reader label than 1000 identical "image"s.
    """

    def fix(m: re.Match[str]) -> str:
        stem = Path(m.group(1)).stem
        words = re.sub(r"[-_]+", " ", re.sub(r"-?\d+$", "", stem)).strip()
        return f"![{words or 'Diagram'}]({m.group(1)}{m.group(2)})"

    return PLAIN_IMAGE.sub(fix, md)


def tidy(md: str) -> str:
    md = admonitions(md)
    md = raw_html(md)
    md = alt_text(md)
    # Pandoc writes {width="663px"} etc. GFM has no attribute syntax and those are
    # Sphinx-era fixed pixel widths that would break the responsive layout anyway.
    md = re.sub(r"\)\{[^}\n]*\}", ")", md)
    md = re.sub(r"\{#[\w:-]+\}\s*$", "", md, flags=re.M)
    # Pandoc emits ::: for anything else it wrapped; drop bare fences.
    md = re.sub(r"^:::+.*$\n?", "", md, flags=re.M)
    md = re.sub(r"\n{4,}", "\n\n\n", md)
    return md.strip() + "\n"


# ---------------------------------------------------------------- link rewriting

RAW = "https://raw.githubusercontent.com/CalebSargeant/docs/master/docs"
# The lab archives and course PDFs behind the old `:download:` role. They are 700 MB
# and include single files of 84 MB, which is past Cloudflare's 25 MiB per-asset cap
# and would put a Pages build over the 1 GB site limit on its own. They stay in the
# repository and are served from it; only the rendered site skips them.
OFFSITE_DIRS = ("_docs", "_files")
OFFSITE_SUFFIX = (".gns3project", ".drawio")
MD_LINK = re.compile(r"\]\(([^)\s]+)\)")
OLD_RTD = re.compile(r"https?://docs\.calebsargeant\.com/en/latest/([\w./-]+)\.html(#[\w.-]*)?")


def rewrite_links(md: str, rel: Path, pages: set[str]) -> tuple[str, int, int]:
    here = rel.parent
    offsite = internal = 0

    def link(m: re.Match[str]) -> str:
        nonlocal offsite
        target = m.group(1)
        if target.startswith(("http://", "https://", "#", "mailto:")):
            return m.group(0)
        path = target.split("#")[0]
        resolved = (here / path).as_posix()
        # normalise the ../ segments the corpus uses across sibling directories
        parts: list[str] = []
        for part in resolved.split("/"):
            if part == "..":
                if parts:
                    parts.pop()
            elif part not in (".", ""):
                parts.append(part)
        clean = "/".join(parts)
        if any(f"/{d}/" in f"/{clean}" for d in OFFSITE_DIRS) or clean.endswith(OFFSITE_SUFFIX):
            offsite += 1
            return f"]({RAW}/{clean})"
        return m.group(0)

    def rtd(m: re.Match[str]) -> str:
        nonlocal internal
        page, anchor = m.group(1), m.group(2) or ""
        if f"{page}.md" not in pages:
            return m.group(0)
        internal += 1
        # A link relative to this document, so --strict validates it like any other.
        return os.path.relpath(f"{page}.md", here.as_posix() or ".") + anchor.lower()

    md = OLD_RTD.sub(rtd, md)
    md = MD_LINK.sub(link, md)
    return md, offsite, internal


# ---------------------------------------------------------------- drive


def convert(doc: Path) -> tuple[str, list[tuple[str, list[str]]], str]:
    rst = doc.read_text(encoding="utf-8", errors="replace")
    # Several index.rst files end on their last toctree entry with no trailing
    # newline, and every block-directive pattern here is line-anchored. Without this
    # the final entry of those toctrees is silently dropped and its pages orphan.
    if not rst.endswith("\n"):
        rst += "\n"
    heading = title_of(rst)
    rst = inline_substitutions(rst)
    rst = roles(rst)
    rst = directives(rst)
    rst, tocs = take_toctrees(rst, doc)
    proc = subprocess.run(
        [PANDOC, "-f", "rst", "-t", "gfm", "--wrap=none"],
        input=rst,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        print(f"  !! pandoc failed on {doc}: {proc.stderr.strip()[:200]}", file=sys.stderr)
        return "", tocs, heading
    return tidy(proc.stdout), tocs, heading


def main() -> int:
    docs = sorted(SRC.rglob("*.rst"))
    print(f"converting {len(docs)} documents")

    toc_by_doc: dict[str, list[tuple[str, list[str]]]] = {}
    title_by_doc: dict[str, str] = {}
    failures = 0
    pages = {str(d.relative_to(SRC).with_suffix(".md")) for d in docs}
    offsite = internal = 0

    for doc in docs:
        rel = doc.relative_to(SRC)
        md, tocs, heading = convert(doc)
        if not md:
            failures += 1
            continue
        md, n_off, n_int = rewrite_links(md, rel, pages)
        offsite += n_off
        internal += n_int
        target = OUT / rel.with_suffix(".md")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(md, encoding="utf-8")
        key = str(rel.with_suffix(""))
        toc_by_doc[key] = tocs
        title_by_doc[key] = heading or rel.stem.replace("-", " ").title()

    print(f"  {offsite} downloads repointed at the repo, {internal} old RTD links relativised")

    # Assets: _images/, _docs/ and anything else that is not RST.
    assets = 0
    for path in SRC.rglob("*"):
        if path.is_dir() or path.suffix == ".rst":
            continue
        target = OUT / path.relative_to(SRC)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        assets += 1

    print(f"  {len(docs) - failures} converted, {failures} failed, {assets} assets copied")

    import json

    Path(ROOT / ".nav-data.json").write_text(
        json.dumps({"toc": toc_by_doc, "titles": title_by_doc}, indent=1)
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
