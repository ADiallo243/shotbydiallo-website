"""Run with python3 scripts/seo_audit.py [--inventory path.json]."""
import argparse
from collections import defaultdict
from difflib import SequenceMatcher
from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
HOST = "https://www.shotbydiallo.com"
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = defaultdict(list)
        self.capture = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        f = self.fields
        if tag == "html":
            f["language"].append(a.get("lang", ""))
        if tag == "meta":
            f[a.get("name", "").lower()].append(a.get("content", ""))
        if tag == "link":
            if a.get("rel") == "canonical":
                f["canonical"].append(a.get("href", ""))
            elif a.get("hreflang"):
                f["alternates"].append((a["hreflang"], a.get("href", "")))
            elif a.get("rel") in ("stylesheet", "icon", "preload"):
                f["assets"].append(a.get("href", ""))
        if tag == "a" and "language-switch" in (a.get("class") or "").split():
            f["switches"].append(a.get("href", ""))
        if tag in ("source", "img") and a.get("srcset"):
            f["assets"].extend(item.split()[0] for item in a["srcset"].split(",") if item.strip())
        if tag == "a" and a.get("href"):
            f["links"].append(a["href"])
        for attr in ("src", "poster", "data-src"):
            if a.get(attr):
                f["assets"].append(a[attr])
        if tag in ("title", "h1") or (tag == "script" and a.get("type") == "application/ld+json"):
            self.capture = tag
            f[tag].append("")

    def handle_data(self, value):
        if self.capture:
            self.fields[self.capture][-1] += value

    def handle_endtag(self, tag):
        if tag == self.capture:
            self.capture = ""


def audit():
    pages = {}
    issues = []
    incoming = defaultdict(set)
    def report(level, file, message):
        issues.append(f"{level} {file}: {message}")
    for file in sorted(ROOT.rglob("*.html")):
        rel = file.relative_to(ROOT).as_posix()
        route = "/" + rel.removesuffix(".html").removesuffix("/index")
        if route == "/index":
            route = "/"
        p = Page()
        p.feed(file.read_text())
        pages[route] = (rel, p.fields)
    sitemap = ET.parse(ROOT / "sitemap.xml")
    listed = [u.text for u in sitemap.findall(f"{NS}url/{NS}loc")]
    site_alternates = {
        item.findtext(NS + "loc"): {
            link.get("hreflang"): link.get("href")
            for link in item.findall("{http://www.w3.org/1999/xhtml}link")
        } for item in sitemap.findall(NS + "url")
    }
    inventory = {}
    titles = {}
    for route, (file, f) in pages.items():
        url = HOST + route
        public = route != "/admin"
        if public:
            for key in ("title", "description", "h1", "language"):
                if len(f[key]) != 1 or not f[key][0].strip():
                    report("ERROR", file, f"expected one nonempty {key}")
            if f["canonical"] != [url]:
                report("ERROR", file, f"expected canonical {url}")
            title = " ".join(f["title"]).casefold()
            for other, name in titles.items():
                if SequenceMatcher(None, title, name).ratio() > .91:
                    report("WARN", file, f"similar title to {other}")
            titles[file] = title
        if ("noindex" in " ".join(f["robots"]).lower()) == public:
            report("ERROR", file, "unexpected robots indexability")
        if listed.count(url) != int(public):
            report("ERROR", file, "sitemap membership or duplication")
        languages = dict(f["alternates"])
        expected_lang = "fr-CA" if route == "/fr" or route.startswith("/fr/") else "en-CA"
        if public and f["language"][0:1] not in ([expected_lang], [expected_lang[:2]]):
            report("ERROR", file, "HTML language conflicts with route")
        localized = {k: v for k, v in languages.items() if k != "x-default"}
        if localized and (localized.get(expected_lang) != url or len(languages) != len(f["alternates"])):
            report("ERROR", file, "missing self alternate or conflicting language targets")
        if localized != {k: v for k, v in site_alternates.get(url, {}).items() if k != "x-default"}:
            report("ERROR", file, "sitemap alternates differ from HTML")
        other_lang = "en-CA" if expected_lang == "fr-CA" else "fr-CA"
        if localized and any(urljoin(url, switch) != localized.get(other_lang) for switch in f["switches"]):
            report("ERROR", file, "language switch destination differs from alternate")
        for lang, target in f["alternates"]:
            dest = pages.get(urlsplit(target).path)
            if not dest or not target.startswith(HOST + "/") or sorted(dest[1]["alternates"]) != sorted(f["alternates"]):
                report("ERROR", file, f"invalid reciprocal {lang} {target}")
        outgoing = set()
        for key in ("links", "assets"):
            for raw in f[key]:
                target = urlsplit(urljoin(url, raw))
                if target.hostname and target.hostname.endswith(".vercel.app"):
                    report("ERROR", file, f"preview URL {raw}")
                if target.netloc != urlsplit(HOST).netloc:
                    continue
                path = unquote(target.path)
                if path in pages:
                    outgoing.add(path)
                    if path != route and public:
                        incoming[path].add(route)
                elif not (ROOT / path.lstrip("/")).is_file():
                    report("ERROR", file, f"unresolved {key}: {raw}")
        types = set()
        def walk(node):
            if isinstance(node, dict):
                value = node.get("@type", [])
                types.update([value] if isinstance(value, str) else value)
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)
        for script in f["script"]:
            try:
                walk(json.loads(script))
            except ValueError as exc:
                report("ERROR", file, f"invalid JSON-LD: {exc}")
        inventory[route] = dict(file=file, url=url, canonical=f["canonical"], title=f["title"],
                                description=f["description"], h1=f["h1"], language=f["language"],
                                alternates=f["alternates"], robots=f["robots"], schema=sorted(types),
                                outgoing=sorted(outgoing), sitemap=url in listed)
    for url in sorted(set(listed) - {HOST + route for route in pages}):
        report("ERROR", "sitemap.xml", f"unknown URL {url}")
    for route, row in inventory.items():
        row["incoming"] = sorted(incoming[route])
        if row["sitemap"] and not incoming[route]:
            report("WARN", row["file"], "no incoming links from other public pages")
    return inventory, issues


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path)
    args = parser.parse_args()
    rows, findings = audit()
    if args.inventory:
        args.inventory.write_text(json.dumps(rows, indent=2, ensure_ascii=False))
    print("\n".join(findings))
    print(f"{len(rows)} HTML routes, {len(findings)} findings")
    raise SystemExit(any(x.startswith("ERROR") for x in findings))
