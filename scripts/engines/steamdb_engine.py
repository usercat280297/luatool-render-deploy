#!/usr/bin/env python3
import html
import json
import re
import sys
import urllib.error
import urllib.request


def strip_tags(value: str) -> str:
  cleaned = re.sub(r"<[^>]+>", " ", value or "", flags=re.IGNORECASE | re.DOTALL)
  cleaned = html.unescape(cleaned)
  cleaned = re.sub(r"\s+", " ", cleaned).strip()
  return cleaned


def parse_float(value: str):
  try:
    return float(value)
  except Exception:
    return None


def parse_int(value: str):
  if not value:
    return None
  match = re.search(r"\d+", value)
  if not match:
    return None
  try:
    return int(match.group(0))
  except Exception:
    return None


def is_bot_protection_page(page: str, title: str = "") -> bool:
  snippet = f"{title}\n{(page or '')[:10000]}".lower()
  markers = [
    "checking your browser",
    "just a moment",
    "attention required",
    "cloudflare",
    "cf-chl",
    "security check to access",
  ]
  return any(marker in snippet for marker in markers)


def parse_steamdb_html(page: str):
  info = {}

  h1_match = re.search(r"<h1[^>]*>(.*?)</h1>", page, flags=re.IGNORECASE | re.DOTALL)
  title_match = re.search(r"<title[^>]*>(.*?)</title>", page, flags=re.IGNORECASE | re.DOTALL)

  title = ""
  if h1_match:
    title = strip_tags(h1_match.group(1))
  if not title and title_match:
    title = strip_tags(title_match.group(1))
    title = re.sub(r"\s*-\s*SteamDB.*$", "", title, flags=re.IGNORECASE).strip()
  if is_bot_protection_page(page, title):
    return None
  if title:
    info["name"] = title

  row_pattern = re.compile(
    r"<tr[^>]*>\s*<t[dh][^>]*>(.*?)</t[dh]>\s*<t[dh][^>]*>(.*?)</t[dh]>\s*</tr>",
    flags=re.IGNORECASE | re.DOTALL,
  )

  for row_match in row_pattern.finditer(page):
    label = strip_tags(row_match.group(1))
    value = strip_tags(row_match.group(2))
    if not label or not value:
      continue

    label_lower = label.lower()
    if "developer" in label_lower:
      info["developer"] = value or "Unknown"
    elif "publisher" in label_lower:
      info["publisher"] = value or "Unknown"
    elif "release date" in label_lower:
      info["releaseDate"] = value
    elif "last record update" in label_lower:
      info["lastUpdate"] = re.split(r"\s*[–-]\s*", value, maxsplit=1)[0].strip()
    elif "dlc" in label_lower:
      parsed_dlc = parse_int(value)
      if parsed_dlc is not None:
        info["dlcCount"] = parsed_dlc

  size_patterns = [
    (re.compile(r"Total\s+size\s+on\s+disk\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)", re.IGNORECASE), True),
    (re.compile(r"total\s+download\s+size\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)", re.IGNORECASE), False),
    (re.compile(r"([\d.]+)\s*(GiB|MiB|GB|MB).*?total", re.IGNORECASE | re.DOTALL), False),
    (re.compile(r"<td>Size</td>\s*<td[^>]*>([\d.]+)\s*(GiB|MiB|GB|MB)", re.IGNORECASE | re.DOTALL), False),
    (re.compile(r"Disk\s+Space[:\s]+([\d.]+)\s*(GiB|MiB|GB|MB)", re.IGNORECASE), False),
  ]

  for pattern, is_full in size_patterns:
    match = pattern.search(page)
    if not match:
      continue

    size = parse_float(match.group(1))
    unit = (match.group(2) or "").upper()
    if size is None or size <= 0 or size >= 2000:
      continue

    is_gb = ("GIB" in unit) or unit == "GB"
    info["size"] = size * 1024 * 1024 * 1024 if is_gb else size * 1024 * 1024
    info["sizeFormatted"] = f"{size} {unit.replace('I', '')}"
    info["sizeType"] = "FULL" if is_full else "Base"
    break

  rating_match = re.search(r"([\d.]+)%.*?(\d[\d,]*)\s+reviews", page, flags=re.IGNORECASE | re.DOTALL)
  if rating_match:
    info["rating"] = f"{rating_match.group(1)}%"
    info["reviewCount"] = rating_match.group(2).replace(",", "")

  return info if len(info) > 0 else None


def fetch_steamdb_info(app_id: str, timeout_ms: int):
  url = f"https://steamdb.info/app/{app_id}/"
  req = urllib.request.Request(
    url,
    headers={
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
  )

  timeout_seconds = max(1.0, float(timeout_ms) / 1000.0)
  with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
    page = response.read().decode("utf-8", errors="replace")

  return parse_steamdb_html(page)


def main():
  if len(sys.argv) < 2:
    print("null")
    return 1

  app_id = str(sys.argv[1]).strip()
  if not app_id:
    print("null")
    return 1

  timeout_ms = 15000
  if len(sys.argv) >= 3:
    try:
      parsed_timeout = int(sys.argv[2])
      if parsed_timeout > 0:
        timeout_ms = parsed_timeout
    except ValueError:
      pass

  try:
    data = fetch_steamdb_info(app_id, timeout_ms)
    if data is None:
      print("null")
      return 0

    print(json.dumps(data, ensure_ascii=True))
    return 0
  except urllib.error.URLError:
    print("null")
    return 0
  except Exception as exc:
    print(f"{{\"error\":\"internal\",\"message\":{json.dumps(str(exc))}}}")
    return 3


if __name__ == "__main__":
  sys.exit(main())
