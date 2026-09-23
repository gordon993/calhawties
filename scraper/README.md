# scrape.py

A simple, general-purpose scraper for public websites, with built-in
pagination handling.

## Setup

```
pip install -r requirements.txt
```

## Usage

```
python scrape.py <url> [options]
```

By default it scrapes the page's title, paragraph text, and all links,
then follows pagination automatically until there's nothing left.

### Pagination modes

It handles two common cases without any extra flags:

1. **"Next page" links** - if the page has `<link rel="next">` or an
   `<a>` tagged `rel="next"` (or with text like "Next", "More", "»"),
   it follows that chain until no next link is found.
2. **`?p=1` / `?page=2` style URLs** - if the starting URL already has a
   numeric page parameter (`p`, `page`, `pg`, `pagenum`, `offset`), it
   keeps incrementing that parameter and stops automatically once a page
   comes back empty.

You can also force an explicit range with `--pages 1-20`.

### Options

| Flag | Description |
|---|---|
| `--selector CSS` | Only extract elements matching a CSS selector (e.g. `.product`, `article`) instead of the whole page's text |
| `--pages 1-20` | Explicit page range for `?p=N` style pagination |
| `--max-pages N` | Safety cap on pages fetched (default 50) |
| `--delay SECONDS` | Delay between requests, be polite (default 0.5) |
| `--out FILE` | Output file (default `output.json`) |
| `--format json\|csv\|txt` | Output format (inferred from `--out` extension) |
| `--quiet` | Suppress progress logging |

### Examples

```
# Follow "Next" links automatically, dump full text/links as JSON
python scrape.py https://example.com/blog

# Explicit page-number pagination, pull only product cards, save as CSV
python scrape.py "https://example.com/shop?p=1" --selector ".product-card" --pages 1-15 --out products.csv

# Plain text dump
python scrape.py https://example.com/articles --out articles.txt
```
