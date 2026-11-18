"""Build the public tutor's search corpus from committed ACCESS learner pages."""

import argparse
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assistant/public/lessons.json"
SKILLS = (
    "reading", "writing", "numeracy", "digital", "problem-solving",
    "communication", "collaboration", "adaptability", "creativity-innovation",
)
LESSON_PATH = re.compile(
    r"skills/(" + "|".join(SKILLS) + r")/(?:lessons/[a-z0-9-]+/)?learner\.html"
)
AI_CHAPTER = "skills/digital/ai-literacy/learner.html"
VOID = set("area base br col embed hr img input link meta param source track wbr".split())
EXCLUDE = set("nav footer script style template noscript svg iframe object form button dialog".split())
BLOCK = set("article blockquote dd div dl dt figcaption h1 h2 h3 h4 h5 h6 hr li p pre section tr".split())


class LearnerText(HTMLParser):
    """Read visible lesson prose, including worked examples, lists and tables."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.title = []
        self.lede = []
        self.body = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        parent = self.stack[-1][1] if self.stack else ""
        if (parent == "skip" or tag in EXCLUDE or "hidden" in attrs
                or attrs.get("aria-hidden", "").lower() == "true"):
            field = "skip"
        elif tag == "h1":
            field = "title"
        elif tag == "p" and "lede" in attrs.get("class", "").split():
            field = "lede"
        elif tag == "main":
            field = "body"
        else:
            field = parent
        if field == "body":
            if tag in BLOCK or tag == "br":
                self.body.append("\n")
            elif tag in {"td", "th"}:
                self.body.append(" ")
        if tag not in VOID:
            self.stack.append((tag, field))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                if self.stack[index][1] == "body" and tag in BLOCK:
                    self.body.append("\n")
                del self.stack[index:]
                break

    def handle_data(self, data):
        field = self.stack[-1][1] if self.stack else ""
        if field in {"title", "lede", "body"}:
            getattr(self, field).append(re.sub(r"\s+", " ", data))

    def lesson(self, path, skill):
        title = " ".join("".join(self.title).split())
        # Insert paragraph breaks only at structural boundaries. Inline emphasis
        # and line-wrapped HTML retain the sentence's original word boundaries.
        lines = ["".join(self.lede)] + "".join(self.body).splitlines()
        text = "\n".join(line for raw in lines if (line := " ".join(raw.split())))
        if not title or not text:
            raise ValueError(f"Missing learner title or material in {path}")
        return {"url": path, "title": title, "skill": skill, "text": text}


def git(*args, input_data=None):
    return subprocess.run(
        ["git", "-C", str(ROOT), *args], input=input_data,
        stdout=subprocess.PIPE, check=True,
    ).stdout


def build(revision):
    # Read Git objects so sparse checkouts produce the same published corpus.
    # Only the nine skills' learner files and the public AI chapter are eligible.
    listing = git("ls-tree", "-r", "-z", revision, "--", "skills")
    pages = []
    for entry in listing.decode().split("\0"):
        if not entry:
            continue
        metadata, path = entry.split("\t", 1)
        match = LESSON_PATH.fullmatch(path)
        if not match and path != AI_CHAPTER:
            continue
        mode, kind, oid = metadata.split()
        if kind != "blob" or mode != "100644":
            raise ValueError(f"Expected a regular HTML file at {path}")
        pages.append((path, match[1] if match else "digital", oid))
    if {skill for _, skill, _ in pages} != set(SKILLS):
        raise ValueError("The source is missing one or more public learner skills")
    requests = "".join(f"{oid}\n" for _, _, oid in pages).encode("ascii")
    blobs = io.BytesIO(git("cat-file", "--batch", input_data=requests))
    rows = []
    for path, skill, oid in pages:
        actual, kind, size = blobs.readline().decode("ascii").split()
        if (actual, kind) != (oid, "blob"):
            raise ValueError(f"Missing committed HTML for {path}")
        parser = LearnerText()
        parser.feed(blobs.read(int(size)).decode("utf-8"))
        parser.close()
        if blobs.read(1) != b"\n":
            raise ValueError(f"Incomplete committed HTML for {path}")
        rows.append(parser.lesson(path, skill))
    serialized = [json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows]
    return ('{"version":1,"lessons":[\n' + ",\n".join(serialized) + "\n]}\n").encode("utf-8"), len(rows)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--revision", default="HEAD", help="committed Git source tree")
    cli.add_argument("--check", action="store_true", help="verify the saved corpus without writing")
    args = cli.parse_args()
    data, count = build(args.revision)
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_bytes() != data:
            cli.exit(1, "Public lesson corpus differs from the committed learner pages.\n")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(data)
    print(f"{count} public learner pages across {len(SKILLS)} skills, {len(data):,} UTF-8 bytes.")
