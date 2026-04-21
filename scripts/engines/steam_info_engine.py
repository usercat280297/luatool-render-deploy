#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.request


def fetch_store_data(app_id: str, timeout_ms: int):
  url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=english"
  req = urllib.request.Request(
    url,
    headers={
      "User-Agent": "discord-lua-bot/2.0"
    }
  )

  timeout_seconds = max(1.0, float(timeout_ms) / 1000.0)
  with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
    payload = response.read().decode("utf-8", errors="replace")

  parsed = json.loads(payload)
  entry = parsed.get(str(app_id), {})
  if not isinstance(entry, dict) or not entry.get("success"):
    return None
  return entry.get("data")


def main():
  if len(sys.argv) < 2:
    print("null")
    return 1

  app_id = str(sys.argv[1]).strip()
  if not app_id:
    print("null")
    return 1

  timeout_ms = 10000
  if len(sys.argv) >= 3:
    try:
      parsed_timeout = int(sys.argv[2])
      if parsed_timeout > 0:
        timeout_ms = parsed_timeout
    except ValueError:
      pass

  try:
    data = fetch_store_data(app_id, timeout_ms)
    if data is None:
      print("null")
      return 0
    print(json.dumps(data, ensure_ascii=True))
    return 0
  except urllib.error.URLError as exc:
    print(f"{{\"error\":\"url_error\",\"message\":{json.dumps(str(exc))}}}")
    return 2
  except Exception as exc:
    print(f"{{\"error\":\"internal\",\"message\":{json.dumps(str(exc))}}}")
    return 3


if __name__ == "__main__":
  sys.exit(main())
