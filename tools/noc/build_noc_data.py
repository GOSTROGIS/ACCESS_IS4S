"""Build noc-data.js from the official Statistics Canada NOC 2021 Version 1.0 CSV files.

Usage (run from outside the download folder, with -I):
  python3 -I build_noc_data.py RAW_DIR OUT_JS DOWNLOAD_DATE

RAW_DIR must hold, unchanged from Statistics Canada:
  noc-2021-v1.0-classification-structure.csv  (English structure)
  noc-2021-v1.0-elements.csv                  (English elements)
  cnp-2021-v1.0-structure-classification.csv  (French structure, for French unit group titles)

Codes, titles and example titles are copied as published. The only change is
trimming leading/trailing spaces and collapsing repeated spaces.
"""
import csv
import json
import os
import re
import sys

SOURCES = [
    {"label": "NOC 2021 Version 1.0 - Classification structure (CSV)",
     "url": "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1/noc-2021-v1.0-classification-structure.csv"},
    {"label": "NOC 2021 Version 1.0 - Elements (CSV)",
     "url": "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1/noc-2021-v1.0-elements.csv"},
    {"label": "CNP 2021 version 1.0 - Structure de classification (CSV, French titles)",
     "url": "https://www.statcan.gc.ca/fr/sujets/norme/cnp/2021/indexV1/cnp-2021-v1.0-structure-classification.csv"},
    {"label": "NOC 2021 Version 1.0 - Statistics Canada standard page",
     "url": "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/indexV1"},
    {"label": "NOC 2021 Version 1.0 - Introduction (TEER categories)",
     "url": "https://www.statcan.gc.ca/en/subjects/standard/noc/2021/introductionV1"},
]

# Official TEER table, Statistics Canada, "The NOC 2021 Version 1.0 TEER Categories"
# (introductionV1, checked 2026-11-07). Copied word for word.
TEER_OFFICIAL = {
    "0": "Management - TEER",
    "1": "Completion of a university degree (bachelor's, master's or doctorate); or Previous experience and expertise in subject matter knowledge from a related occupation found in TEER 2 (when applicable).",
    "2": "Completion of a post-secondary education program of two to three years at community college, institute of technology or CÉGEP; or Completion of an apprenticeship training program of two to five years; or Occupations with supervisory or significant safety (e.g. police officers and firefighters) responsibilities; or Several years of experience in a related occupation from TEER 3 (when applicable).",
    "3": "Completion of a post-secondary education program of less than two years at community college, institute of technology or CÉGEP; or Completion of an apprenticeship training program of less than two years; or More than six months of on-the-job training, training courses or specific work experience with some secondary school education; or Several years of experience in a related occupation from TEER 4 (when applicable).",
    "4": "Completion of secondary school; or Several weeks of on-the-job training with some secondary school education; or Experience in a related occupation from TEER 5 (when applicable).",
    "5": "Short work demonstration and no formal educational requirements.",
}


def clean(s):
    return re.sub(r"\s+", " ", s).strip()


def read(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


def main():
    raw, out, date = sys.argv[1], sys.argv[2], sys.argv[3]
    st = read(os.path.join(raw, "noc-2021-v1.0-classification-structure.csv"))
    hdr, rows = st[0], st[1:]
    assert hdr[:4] == ["Level", "Hierarchical structure", "Code - NOC 2021 V1.0", "Class title"], hdr
    broad, major, units = {}, {}, {}
    for r in rows:
        lvl, _, code, title, definition = r[0], r[1], clean(r[2]), clean(r[3]), clean(r[4])
        if lvl == "1":
            broad[code] = title
        elif lvl == "2":
            major[code] = title
        elif lvl == "5":
            assert re.fullmatch(r"\d{5}", code), code
            units[code] = {"t": title, "d": definition}

    fr = read(os.path.join(raw, "cnp-2021-v1.0-structure-classification.csv"))
    for r in fr[1:]:
        if r[0] == "5":
            units[clean(r[2])]["f"] = clean(r[3])

    el = read(os.path.join(raw, "noc-2021-v1.0-elements.csv"))
    ehdr = el[0]
    assert ehdr == ["Level", "Code - NOC 2021 V1.0", "Class title",
                    "Element Type Label English", "Element Description English"], ehdr
    ex, il, inc, exc = {}, {}, {}, {}
    for r in el[1:]:
        code, kind, text = clean(r[1]), r[3], clean(r[4])
        if r[0] != "5" or not text:
            continue
        target = {"All examples": ex, "Illustrative example(s)": il,
                  "Inclusion(s)": inc, "Exclusion(s)": exc}.get(kind)
        if target is not None:
            target.setdefault(code, []).append(text)

    out_units = []
    n_ex = 0
    for code in sorted(units):
        u = units[code]
        examples = ex.get(code, [])
        pos = {t: i for i, t in enumerate(examples)}
        ill = [pos[t] for t in il.get(code, []) if t in pos]
        n_ex += len(examples)
        out_units.append([code, u["t"], u.get("f", ""), u["d"], examples, ill,
                          inc.get(code, []), exc.get(code, [])])

    data = {
        "meta": {
            "version": "NOC 2021 Version 1.0",
            "publisher": "Statistics Canada and Employment and Social Development Canada",
            "downloaded": date,
            "sources": SOURCES,
            "unitGroups": len(out_units),
            "exampleTitles": n_ex,
            "fields": ["code", "title", "titleFr", "definition", "allExamples",
                       "illustrativeIndexes", "inclusions", "exclusions"],
        },
        "broad": broad,
        "major": major,
        "teer": TEER_OFFICIAL,
        "units": out_units,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* National Occupational Classification (NOC) 2021 Version 1.0, Statistics Canada.\n"
                "   Generated by build_noc_data.py from the official CSV files downloaded " + date + ".\n"
                "   Do not edit by hand. Sources are listed in NOC_DATA.meta.sources. */\n")
        f.write("window.NOC_DATA=" + body + "\n")
    print(len(out_units), "unit groups,", n_ex, "example titles,", os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
