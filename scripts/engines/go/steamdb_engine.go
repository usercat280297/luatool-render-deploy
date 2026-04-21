package main

import (
	"encoding/json"
	"fmt"
	htmlstd "html"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	reTags        = regexp.MustCompile(`(?is)<[^>]+>`)
	reWhitespace  = regexp.MustCompile(`\s+`)
	reTitle       = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)
	reH1          = regexp.MustCompile(`(?is)<h1[^>]*>(.*?)</h1>`)
	reTableRow    = regexp.MustCompile(`(?is)<tr[^>]*>\s*<t[dh][^>]*>(.*?)</t[dh]>\s*<t[dh][^>]*>(.*?)</t[dh]>\s*</tr>`)
	reDigit       = regexp.MustCompile(`\d+`)
	reRating      = regexp.MustCompile(`(?is)([\d.]+)%.*?(\d[\d,]*)\s+reviews`)
	reDashSplit   = regexp.MustCompile(`\s*[–-]\s*`)
	reSteamSuffix = regexp.MustCompile(`(?i)\s*-\s*SteamDB.*$`)
)

type sizePattern struct {
	re     *regexp.Regexp
	isFull bool
}

var sizePatterns = []sizePattern{
	{re: regexp.MustCompile(`(?i)Total\s+size\s+on\s+disk\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)`), isFull: true},
	{re: regexp.MustCompile(`(?i)total\s+download\s+size\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)`), isFull: false},
	{re: regexp.MustCompile(`(?is)([\d.]+)\s*(GiB|MiB|GB|MB).*?total`), isFull: false},
	{re: regexp.MustCompile(`(?is)<td>Size</td>\s*<td[^>]*>([\d.]+)\s*(GiB|MiB|GB|MB)`), isFull: false},
	{re: regexp.MustCompile(`(?i)Disk\s+Space[:\s]+([\d.]+)\s*(GiB|MiB|GB|MB)`), isFull: false},
}

func stripTags(value string) string {
	out := reTags.ReplaceAllString(value, " ")
	out = htmlstd.UnescapeString(out)
	out = reWhitespace.ReplaceAllString(out, " ")
	return strings.TrimSpace(out)
}

func isBotProtectionPage(page string, title string) bool {
	snippet := strings.ToLower(title + "\n" + page)
	if len(snippet) > 10000 {
		snippet = snippet[:10000]
	}

	markers := []string{
		"checking your browser",
		"just a moment",
		"attention required",
		"cloudflare",
		"cf-chl",
		"security check to access",
	}

	for _, marker := range markers {
		if strings.Contains(snippet, marker) {
			return true
		}
	}
	return false
}

func parseSteamDBHTML(page string) map[string]any {
	info := map[string]any{}

	var title string
	if h1Match := reH1.FindStringSubmatch(page); len(h1Match) > 1 {
		title = stripTags(h1Match[1])
	}
	if title == "" {
		if titleMatch := reTitle.FindStringSubmatch(page); len(titleMatch) > 1 {
			title = stripTags(titleMatch[1])
			title = strings.TrimSpace(reSteamSuffix.ReplaceAllString(title, ""))
		}
	}
	if title != "" {
		if isBotProtectionPage(page, title) {
			return nil
		}
		info["name"] = title
	}

	for _, row := range reTableRow.FindAllStringSubmatch(page, -1) {
		if len(row) < 3 {
			continue
		}
		label := stripTags(row[1])
		value := stripTags(row[2])
		if label == "" || value == "" {
			continue
		}

		labelLower := strings.ToLower(label)
		switch {
		case strings.Contains(labelLower, "developer"):
			info["developer"] = value
		case strings.Contains(labelLower, "publisher"):
			info["publisher"] = value
		case strings.Contains(labelLower, "release date"):
			info["releaseDate"] = value
		case strings.Contains(labelLower, "last record update"):
			parts := reDashSplit.Split(value, 2)
			if len(parts) > 0 {
				info["lastUpdate"] = strings.TrimSpace(parts[0])
			}
		case strings.Contains(labelLower, "dlc"):
			if digit := reDigit.FindString(value); digit != "" {
				if parsed, err := strconv.Atoi(digit); err == nil {
					info["dlcCount"] = parsed
				}
			}
		}
	}

	for _, pattern := range sizePatterns {
		match := pattern.re.FindStringSubmatch(page)
		if len(match) < 3 {
			continue
		}

		size, err := strconv.ParseFloat(match[1], 64)
		if err != nil || size <= 0 || size >= 2000 {
			continue
		}

		unit := strings.ToUpper(strings.TrimSpace(match[2]))
		isGB := strings.Contains(unit, "GIB") || unit == "GB"
		if isGB {
			info["size"] = size * 1024 * 1024 * 1024
		} else {
			info["size"] = size * 1024 * 1024
		}

		info["sizeFormatted"] = fmt.Sprintf("%v %s", size, strings.ReplaceAll(unit, "I", ""))
		if pattern.isFull {
			info["sizeType"] = "FULL"
		} else {
			info["sizeType"] = "Base"
		}
		break
	}

	if rating := reRating.FindStringSubmatch(page); len(rating) > 2 {
		info["rating"] = fmt.Sprintf("%s%%", rating[1])
		info["reviewCount"] = strings.ReplaceAll(rating[2], ",", "")
	}

	if len(info) == 0 {
		return nil
	}
	return info
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("null")
		os.Exit(1)
	}

	appID := strings.TrimSpace(os.Args[1])
	if appID == "" {
		fmt.Println("null")
		os.Exit(1)
	}

	timeoutMs := 15000
	if len(os.Args) >= 3 {
		if parsed, err := strconv.Atoi(os.Args[2]); err == nil && parsed > 0 {
			timeoutMs = parsed
		}
	}

	url := fmt.Sprintf("https://steamdb.info/app/%s/", appID)
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println("null")
		os.Exit(2)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("null")
		os.Exit(3)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Println("null")
		os.Exit(4)
	}

	info := parseSteamDBHTML(string(body))
	if info == nil {
		fmt.Println("null")
		return
	}

	encoded, err := json.Marshal(info)
	if err != nil {
		fmt.Println("null")
		os.Exit(5)
	}

	fmt.Println(string(encoded))
}
