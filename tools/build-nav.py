#!/usr/bin/env python3
"""Turn the toctrees lifted out of the RST into a MkDocs nav.

Walks from the root index the way Sphinx did, so the published order is the order
the author chose rather than alphabetical. Anything no toctree reaches is reported
and appended, because a page that exists and is unreachable is the failure mode
this whole migration is meant to avoid.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

data = json.loads((ROOT / ".nav-data.json").read_text())
TOC: dict[str, list[tuple[str, list[str]]]] = {
    k: [(c, e) for c, e in v] for k, v in data["toc"].items()
}
TITLES: dict[str, str] = data["titles"]

seen: set[str] = set()
missing: list[str] = []


def title_for(key: str) -> str:
    if key in TITLES and TITLES[key]:
        return TITLES[key]
    return key.rsplit("/", 1)[-1].replace("-", " ").title()


def node(key: str) -> object:
    """A nav entry for `key`: a bare page, or a section when it has children."""
    seen.add(key)
    if not (DOCS / f"{key}.md").exists():
        missing.append(key)
        return None

    children: list[object] = []
    for caption, entries in TOC.get(key, []):
        group: list[object] = []
        for entry in entries:
            child = f"{key.rsplit('/', 1)[0]}/{entry}" if "/" in key else entry
            child = child.replace("/./", "/")
            sub = node(child)
            if sub is not None:
                group.append(sub)
        if not group:
            continue
        # A captioned toctree is a named group; an anonymous one folds into the parent.
        children.append({caption: group} if caption else group)

    flat: list[object] = []
    for c in children:
        flat.extend(c) if isinstance(c, list) else flat.append(c)

    if not flat:
        return {title_for(key): f"{key}.md"}
    # `navigation.indexes` makes a bare page first in a section its landing page.
    return {title_for(key): [f"{key}.md", *flat]}


root = node("index")
assert isinstance(root, dict)
nav: list[object] = [{"Home": "index.md"}]
body = next(iter(root.values()))
nav.extend(body[1:] if isinstance(body, list) else [])

everything = {
    str(p.relative_to(DOCS).with_suffix("")) for p in DOCS.rglob("*.md")
}
orphans = sorted(everything - seen)


def dump(items: list[object], indent: int = 2) -> list[str]:
    out: list[str] = []
    pad = " " * indent
    for item in items:
        (key, value), = item.items()  # type: ignore[union-attr]
        if isinstance(value, str):
            out.append(f"{pad}- {key}: {value}")
        else:
            out.append(f"{pad}- {key}:")
            for v in value:
                if isinstance(v, str):
                    out.append(f"{pad}  - {v}")
                else:
                    out.extend(dump([v], indent + 2))
    return out


lines = dump(nav)
if orphans:
    lines.append("  - Unfiled:")
    for o in orphans:
        lines.append(f"    - {title_for(o)}: {o}.md")

(ROOT / ".nav.yml").write_text("nav:\n" + "\n".join(lines) + "\n")
print(f"nav: {len(seen)} pages reached, {len(orphans)} orphans, {len(missing)} missing")
if missing:
    print("  MISSING:", ", ".join(sorted(set(missing))[:10]))
if orphans:
    print("  ORPHANS:", ", ".join(orphans[:10]))
