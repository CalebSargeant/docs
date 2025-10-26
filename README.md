<!-- Quality & Security Overview -->
[![CodeQL](https://github.com/CalebSargeant/docs/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/CalebSargeant/docs/actions/workflows/github-code-scanning/codeql)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=alert_status&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=security_rating&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Known Vulnerabilities](https://snyk.io/test/github/MagmaMoose/pentesting/badge.svg)](https://snyk.io/test/github/MagmaMoose/pentesting)

<!-- Code Quality & Maintainability -->
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=sqale_rating&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=reliability_rating&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Technical Debt](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=sqale_index&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)

<!-- Code Metrics -->
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=coverage&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Bugs](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=bugs&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=vulnerabilities&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=code_smells&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)

<!-- Project Stats -->
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=ncloc&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)
[![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=CalebSargeant_docs&metric=duplicated_lines_density&token=ebfb6b12c8469925ada2be9a1af34b9679e55d40)](https://sonarcloud.io/summary/new_code?id=CalebSargeant_docs)

# Docs

A place for all of my technical how-to guides, documentation, study notes, random notes and things I jot down, etc.

## Documentation Format

This documentation is built using [MkDocs](https://www.mkdocs.org/) with the [Material theme](https://squidfunk.github.io/mkdocs-material/). All documentation is written in Markdown format.

### Building the Documentation

To build the documentation locally:

```bash
# Install dependencies
pip install -r requirements.txt

# Build the site
mkdocs build

# Serve locally for development
mkdocs serve
```

The built site will be in the `site/` directory and will be automatically deployed to GitHub Pages when changes are pushed to the main branch.

### Previous Format

This documentation was previously built using Sphinx with reStructuredText (RST) files. As of 2025, it has been fully migrated to MkDocs with Markdown files (0% RST, 100% Markdown).
