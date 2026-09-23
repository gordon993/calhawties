# scra.py

A simple, general-purpose scraper for public websites, with built-in
pagination handling.

## Setup

```
pip install -r requirements.txt
```

## Usage

```
python scra.py <url>
```

That's it. By default it scrapes the page's title, paragraph text, and all
links, follows pagination automatically until there's nothing left, and
saves the result into a new folder under `~/Downloads/scrapes/` (named after
the site and the time you ran it), so nothing gets overwritten between runs.

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
| `--out FILE` | Output file path, overrides the default `~/Downloads/scrapes/...` folder |
| `--format json\|csv\|txt` | Output format (default json; inferred from `--out` extension if you set one) |
| `--quiet` | Suppress progress logging |
| `--images` | Also download every image (jpg/png/gif/webp) found across all pages into an `images/` subfolder next to the output |

### Examples

```
# Follow "Next" links automatically, dump full text/links as JSON
python scra.py https://example.com/blog

# Explicit page-number pagination, pull only product cards, save as CSV
python scra.py "https://example.com/shop?p=1" --selector ".product-card" --pages 1-15 --out products.csv

# Plain text dump
python scra.py https://example.com/articles --out articles.txt
```
