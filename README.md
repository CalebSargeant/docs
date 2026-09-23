# Caleb Sargeant's Docs

Technical how-to guides, runbooks and study notes: networking, cloud, Linux,
containers and the automation around them. Published with MkDocs Material at
**<https://docs.calebsargeant.com/>**.

[![Docs](https://github.com/CalebSargeant/docs/actions/workflows/docs.yml/badge.svg)](https://github.com/CalebSargeant/docs/actions/workflows/docs.yml)
[![Release](https://github.com/CalebSargeant/docs/actions/workflows/release.yml/badge.svg)](https://github.com/CalebSargeant/docs/actions/workflows/release.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=alert_status&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)

## Writing

Pages are Markdown under `docs/`, one directory per topic. The nav is explicit
in `mkdocs.yml`: a new page has to be added there or it will not appear, which
is deliberate: this corpus is large enough that an automatic nav is unreadable.

Images sit in `_images/` beside the page using them. Large downloads (lab
archives, GNS3 projects, course PDFs) live in `_docs/`, are excluded from the
built site and are linked from `raw.githubusercontent.com`: together they
exceed what a static host will serve.

## Building

```bash
pip install -r docs/requirements.txt
mkdocs serve            # preview on http://127.0.0.1:8000
mkdocs build --strict   # as CI runs it; a broken link fails the build
```

## Shipping

`docs.yml` builds with [tremvok](https://github.com/MagmaMoose/tremvok)
(`target: cloudflare-docs`), deploys an assets-only Cloudflare Worker, and
publishes `llms.txt`, `llms-full.txt` and the corpus that
[mcp.calebsargeant.com](https://mcp.calebsargeant.com/) searches. Pull requests
build without publishing. `release.yml` tags with [diatreme](https://github.com/MagmaMoose/diatreme).

## Licence

GPL-3.0. See [LICENSE](LICENSE).
