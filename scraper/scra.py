#!/usr/bin/env python3
"""Scrape a public website, following pagination automatically.

Usage examples:
  python scra.py https://example.com/blog
  python scra.py "https://example.com/list?p=1" --selector ".product"
  python scra.py https://example.com/news --pages 1-20 --out news.json
"""
import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse

import requests
from bs4 import BeautifulSoup

DOWNLOADS_DIR = os.path.join(os.path.expanduser("~"), "Downloads")

USER_AGENT = (
    "Mozilla/5.0 (compatible; SimpleScraper/1.0; +https://example.com/bot)"
)

# param names commonly used for pagination in URLs
PAGE_PARAM_CANDIDATES = ["p", "page", "pg", "pagenum", "page_num", "offset"]

NEXT_LINK_TEXT = re.compile(r"^\s*(next|older|more|›|»|next\s*page)\s*$", re.I)

IMAGE_EXT_RE = re.compile(r"\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$", re.I)


def fetch(session, url, delay):
    resp = session.get(url, timeout=20)
    resp.raise_for_status()
    if delay:
        time.sleep(delay)
    return resp.text


def find_page_param(url):
    """Return (param_name, current_value) if the URL already encodes a page number."""
    qs = parse_qs(urlparse(url).query)
    for name in PAGE_PARAM_CANDIDATES:
        if name in qs and qs[name][0].isdigit():
            return name, int(qs[name][0])
    return None, None


def build_page_url(url, param, page_num):
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    qs[param] = [str(page_num)]
    new_query = urlencode(qs, doseq=True)
    return urlunparse(parsed._replace(query=new_query))


def find_next_link(soup, base_url):
    """Look for a rel="next" link, then fall back to anchor text like 'Next'."""
    link = soup.find("link", rel=lambda v: v and "next" in v)
    if link and link.get("href"):
        return urljoin(base_url, link["href"])

    a = soup.find("a", rel=lambda v: v and "next" in v)
    if a and a.get("href"):
        return urljoin(base_url, a["href"])

    for a in soup.find_all("a", href=True):
        text = a.get_text(strip=True)
        if text and NEXT_LINK_TEXT.match(text):
            return urljoin(base_url, a["href"])

    return None


def extract(soup, url, selector):
    if selector:
        items = []
        for el in soup.select(selector):
            items.append(
                {
                    "text": el.get_text(" ", strip=True),
                    "html": str(el),
                    "links": [urljoin(url, a["href"]) for a in el.find_all("a", href=True)],
                }
            )
        return {"url": url, "title": soup.title.get_text(strip=True) if soup.title else "", "items": items}

    title = soup.title.get_text(strip=True) if soup.title else ""
    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    paragraphs = [p for p in paragraphs if p]
    links = sorted({urljoin(url, a["href"]) for a in soup.find_all("a", href=True)})
    return {"url": url, "title": title, "text": "\n\n".join(paragraphs), "links": links}


def find_image_urls(soup, base_url):
    urls = set()
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src")
        if src:
            urls.add(urljoin(base_url, src))
        srcset = img.get("srcset")
        if srcset:
            for part in srcset.split(","):
                candidate = part.strip().split(" ")[0]
                if candidate:
                    urls.add(urljoin(base_url, candidate))
    return {u for u in urls if IMAGE_EXT_RE.search(urlparse(u).path)}


def download_images(image_urls, images_dir, session, delay, verbose=True):
    os.makedirs(images_dir, exist_ok=True)
    used_names = set()
    saved = 0
    for url in sorted(image_urls):
        name = os.path.basename(urlparse(url).path) or "image"
        base, ext = os.path.splitext(name)
        candidate = name
        i = 1
        while candidate in used_names:
            candidate = f"{base}_{i}{ext}"
            i += 1
        used_names.add(candidate)
        dest = os.path.join(images_dir, candidate)
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            with open(dest, "wb") as f:
                f.write(resp.content)
            saved += 1
            if verbose:
                print(f"  image: {url} -> {candidate}", file=sys.stderr)
        except requests.RequestException as e:
            if verbose:
                print(f"  skipped image {url}: {e}", file=sys.stderr)
        if delay:
            time.sleep(delay)
    return saved


def default_output_path(start_url, fmt):
    """~/Downloads/scrapes/<site>_<timestamp>/output.<fmt>, created fresh each run."""
    domain = urlparse(start_url).netloc.replace(":", "_") or "site"
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    folder = os.path.join(DOWNLOADS_DIR, "scrapes", f"{domain}_{stamp}")
    return os.path.join(folder, f"output.{fmt}")


def parse_page_range(spec):
    """'1-20' -> (1, 20); '5' -> (1, 5)"""
    if "-" in spec:
        start, end = spec.split("-", 1)
        return int(start), int(end)
    return 1, int(spec)


def scrape(start_url, selector=None, page_range=None, max_pages=50, delay=0.5, out=None, fmt="json", verbose=True, images=False, images_dir=None):
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    results = []
    seen = set()
    image_urls = set()

    param, current = find_page_param(start_url)

    if page_range or param:
        # Numeric pagination: either explicit --pages range, or URL already
        # has a page-style query param (?p=1, ?page=2, ...).
        if page_range:
            start, end = page_range
        else:
            start, end = current, current + max_pages - 1
        if not param:
            param = "p"

        for n in range(start, end + 1):
            page_url = build_page_url(start_url, param, n)
            if page_url in seen:
                break
            seen.add(page_url)
            if verbose:
                print(f"[{n}] GET {page_url}", file=sys.stderr)
            try:
                html = fetch(session, page_url, delay)
            except requests.RequestException as e:
                if verbose:
                    print(f"  stopping: {e}", file=sys.stderr)
                break
            soup = BeautifulSoup(html, "lxml")
            data = extract(soup, page_url, selector)
            if not page_range and not data.get("text") and not data.get("items"):
                # auto-detected range: stop once a page comes back empty
                break
            results.append(data)
            if images:
                image_urls |= find_image_urls(soup, page_url)
    else:
        # Auto-follow "next page" links found in the HTML itself.
        url = start_url
        for n in range(1, max_pages + 1):
            if url in seen:
                break
            seen.add(url)
            if verbose:
                print(f"[{n}] GET {url}", file=sys.stderr)
            try:
                html = fetch(session, url, delay)
            except requests.RequestException as e:
                if verbose:
                    print(f"  stopping: {e}", file=sys.stderr)
                break
            soup = BeautifulSoup(html, "lxml")
            results.append(extract(soup, url, selector))
            if images:
                image_urls |= find_image_urls(soup, url)
            next_url = find_next_link(soup, url)
            if not next_url or next_url == url:
                break
            url = next_url

    if out:
        write_output(results, out, fmt)

    if images and image_urls:
        target = images_dir or os.path.join(os.path.dirname(out) or ".", "images")
        saved = download_images(image_urls, target, session, delay, verbose)
        if verbose:
            print(f"Saved {saved} image(s) -> {target}", file=sys.stderr)

    return results


def write_output(results, out, fmt):
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if fmt == "json":
        with open(out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
    elif fmt == "csv":
        with open(out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["url", "title", "text_or_items"])
            for r in results:
                body = r.get("text") or json.dumps(r.get("items", []), ensure_ascii=False)
                writer.writerow([r["url"], r.get("title", ""), body])
    elif fmt == "txt":
        with open(out, "w", encoding="utf-8") as f:
            for r in results:
                f.write(f"=== {r['url']} ===\n{r.get('title', '')}\n\n")
                if "items" in r:
                    for item in r["items"]:
                        f.write(item["text"] + "\n")
                else:
                    f.write(r.get("text", "") + "\n")
                f.write("\n")
    else:
        raise ValueError(f"unknown format: {fmt}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("url", help="Starting URL to scrape")
    parser.add_argument("--selector", help="CSS selector for the items you want (e.g. '.post', 'article')")
    parser.add_argument("--pages", help="Explicit page range for ?p=N style pagination, e.g. 1-20")
    parser.add_argument("--max-pages", type=int, default=50, help="Safety cap on number of pages (default 50)")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds to wait between requests (default 0.5)")
    parser.add_argument("--out", default=None, help="Output file path (default: a new folder under ~/Downloads/scrapes)")
    parser.add_argument("--format", choices=["json", "csv", "txt"], default="json", help="Output format, used for the auto-generated filename (default json)")
    parser.add_argument("--quiet", action="store_true", help="Suppress progress output")
    parser.add_argument("--images", action="store_true", help="Also download every image (jpg/png/gif/webp) found into an 'images' subfolder next to the output")
    args = parser.parse_args()

    if args.out:
        fmt = args.format if args.format != "json" else (args.out.rsplit(".", 1)[-1] if "." in args.out else "json")
        if fmt not in ("json", "csv", "txt"):
            fmt = "json"
        out = args.out
    else:
        fmt = args.format
        out = default_output_path(args.url, fmt)

    page_range = parse_page_range(args.pages) if args.pages else None

    results = scrape(
        args.url,
        selector=args.selector,
        page_range=page_range,
        max_pages=args.max_pages,
        delay=args.delay,
        out=out,
        fmt=fmt,
        verbose=not args.quiet,
        images=args.images,
    )

    if not args.quiet:
        print(f"Scraped {len(results)} page(s) -> {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
