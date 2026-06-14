#!/usr/bin/env python3
"""Regenerate backend/scripts/data/amour-schools.json from Amour PDF exports."""
import re
import json
import os
from pypdf import PdfReader

ELEMENTARY_PDF = os.path.expanduser("~/Downloads/AMOUR Jan'26 Elementary.pdf")
SECONDARY_PDF = os.path.expanduser("~/Downloads/AMOUR Jan'26 Secondary.pdf")
BANK_PDF = os.path.expanduser("~/Downloads/Amour school data Bank Details.pdf")
OUT_PATH = os.path.join(os.path.dirname(__file__), "data", "amour-schools.json")

CATEGORIES = [
    "Primary School", "Middle School", "High School", "UHS", "UMV", "UMS",
    "UPGRADED M S", "NEW P S", "KANYA P S", "KANYA M S", "KANYA U M S",
    "U M S", "U H S", "UPGRADED H S", "UTKRAMIT HIGH SCHOOL",
    "JANTA HIGH SCHOOL", "PROJECT GIRLS HIGH SCHOOL",
]


def parse_billing_pdf(path):
    reader = PdfReader(path)
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    schools = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line.strip())
        if "AMOUR" not in line or not re.search(r"10\d{9}", line):
            continue
        m = re.search(r"(\d+)\s+AMOUR\s+(10\d{9})\s+(.+)", line)
        if not m:
            continue
        sr, udise, rest = m.group(1), m.group(2), m.group(3)
        cat = ""
        name_part = rest
        for c in sorted(CATEGORIES, key=len, reverse=True):
            idx = rest.upper().find(c.upper())
            if idx != -1:
                name_part = rest[:idx].strip()
                cat = rest[idx : idx + len(c)]
                break
        if not cat:
            continue
        nums = re.findall(r"(\d+(?:\.\d+)?)", rest[len(name_part) + len(cat) :])
        if len(nums) < 4:
            continue
        schools.append({
            "srNo": int(sr),
            "udise": udise,
            "schoolName": name_part.strip(),
            "schoolCategory": cat.strip(),
            "noOfToilets": int(float(nums[0])),
            "govtUnitRate": float(nums[3]),
            "block": "AMOUR",
            "district": "PURNIA",
        })
    return schools


def norm_name(n):
    return re.sub(r"[^a-z0-9]", "", n.lower())


def main():
    by_udise = {}
    for s in parse_billing_pdf(ELEMENTARY_PDF) + parse_billing_pdf(SECONDARY_PDF):
        by_udise[s["udise"]] = s

    reader = PdfReader(BANK_PDF)
    bank_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    for line in bank_text.splitlines():
        line = re.sub(r"\s+", " ", line.strip())
        m = re.match(
            r"^(\d+)\s+(.+?)\s+(\d{8,}|0\d{10,})\s+([A-Z0-9]{8,})\s+(.+?)\s+([\d.]+)\s+(.+)$",
            line,
        )
        if not m:
            continue
        bank = {
            "schoolNameHint": m.group(2).strip(),
            "accountNumber": m.group(3).strip(),
            "ifscCode": m.group(4).strip(),
            "accountHolderName": m.group(5).strip(),
            "partnerMonthlyPay": float(m.group(6)),
            "paymentMethod": m.group(7).strip(),
        }
        hint = norm_name(bank["schoolNameHint"])
        best, best_score = None, 0
        for udise, rec in by_udise.items():
            sn = norm_name(rec["schoolName"])
            score = 100 if hint == sn else 80 if hint in sn or sn in hint else 40 if hint[:6] in sn else 0
            if score > best_score:
                best, best_score = udise, score
        if best and best_score >= 40:
            by_udise[best].update({
                "sweeperName": bank["accountHolderName"],
                "accountHolderName": bank["accountHolderName"],
                "accountNumber": bank["accountNumber"],
                "ifscCode": bank["ifscCode"],
                "partnerMonthlyPay": bank["partnerMonthlyPay"],
                "paymentMethod": bank["paymentMethod"],
            })

    out = sorted(by_udise.values(), key=lambda x: x.get("srNo", 0))
    for s in out:
        if not s.get("partnerMonthlyPay"):
            s["partnerMonthlyPay"] = 4500 if s.get("govtUnitRate", 0) >= 100 else 3750
        s["rates"] = s["partnerMonthlyPay"]

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(out)} schools to {OUT_PATH}")


if __name__ == "__main__":
    main()
