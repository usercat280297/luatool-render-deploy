package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("null")
		os.Exit(1)
	}

	appID := os.Args[1]
	timeoutMs := 10000
	if len(os.Args) >= 3 {
		if parsed, err := strconv.Atoi(os.Args[2]); err == nil && parsed > 0 {
			timeoutMs = parsed
		}
	}

	url := fmt.Sprintf("https://store.steampowered.com/api/appdetails?appids=%s&l=english", appID)
	client := &http.Client{Timeout: time.Duration(timeoutMs) * time.Millisecond}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Println("null")
		os.Exit(2)
	}
	req.Header.Set("User-Agent", "discord-lua-bot/2.0")

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

	var payload map[string]map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		fmt.Println("null")
		os.Exit(5)
	}

	entry, ok := payload[appID]
	if !ok {
		fmt.Println("null")
		return
	}

	success, _ := entry["success"].(bool)
	if !success {
		fmt.Println("null")
		return
	}

	data, ok := entry["data"]
	if !ok {
		fmt.Println("null")
		return
	}

	encoded, err := json.Marshal(data)
	if err != nil {
		fmt.Println("null")
		os.Exit(6)
	}

	fmt.Println(string(encoded))
}
