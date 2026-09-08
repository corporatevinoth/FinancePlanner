# Lightweight, responsive local web server using built-in Windows .NET HttpListener
# Provides fast static file serving and a high-performance local proxy for live market quotes
# Responds instantly to Ctrl+C or 'q' key press

Add-Type -AssemblyName System.Net.Http

$port = 8080
$prefix = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

# Shared HTTP client for market quotes
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
$httpClient.Timeout = [System.TimeSpan]::FromSeconds(6)

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Finance Planner Running at: $prefix" -ForegroundColor Green
    Write-Host "  Live Market Proxy Active at: ${prefix}api/batch-quotes" -ForegroundColor Green
    Write-Host "  Press 'q' or Ctrl+C to stop the server" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    Start-Process $prefix
} catch {
    Write-Host "Port $port already in use, opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:$port/"
    exit
}

$mimeMap = @{
    ".html" = "text/html"
    ".htm"  = "text/html"
    ".css"  = "text/css"
    ".js"   = "application/javascript"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

# Function to fetch multiple Yahoo Finance quotes in parallel
function Get-YahooBatchQuotes([string[]]$symbols, [string]$range = "1d", [string]$interval = "1d") {
    $results = @{}
    $tasks = @()
    $symbolList = @()

    foreach ($s in $symbols) {
        $clean = $s.Trim().ToUpper()
        if (-not $clean) { continue }
        $url = "https://query1.finance.yahoo.com/v8/finance/chart/$([System.Uri]::EscapeDataString($clean))?interval=$interval&range=$range"
        $tasks += $httpClient.GetStringAsync($url)
        $symbolList += $clean
    }

    if ($tasks.Count -eq 0) {
        return $results
    }

    try {
        $null = [System.Threading.Tasks.Task]::WaitAll($tasks, 5000)
    } catch {
        # Catch individual task errors gracefully
    }

    for ($i = 0; $i -lt $tasks.Count; $i++) {
        $task = $tasks[$i]
        $sym = $symbolList[$i]
        if ($task.Status -eq [System.Threading.Tasks.TaskStatus]::RanToCompletion) {
            try {
                $json = $task.Result | ConvertFrom-Json
                $meta = $json.chart.result[0].meta
                $price = $meta.regularMarketPrice
                if (-not $price) { $price = $meta.chartPreviousClose }
                $prev = $meta.chartPreviousClose
                if (-not $prev) { $prev = $price }
                $chg = if ($prev -and $prev -gt 0) { [Math]::Round((($price - $prev) / $prev) * 100, 2) } else { 0 }
                $curr = $meta.currency
                if (-not $curr) {
                    $curr = if ($sym.EndsWith('.NS') -or $sym.EndsWith('.BO')) { 'INR' } else { 'USD' }
                }
                $results[$sym] = @{
                    symbol = $sym
                    price = [Math]::Round([double]$price, 2)
                    previousClose = [Math]::Round([double]$prev, 2)
                    changePercent = $chg
                    currency = $curr
                    shortName = $meta.shortName
                }
            } catch {
                # Skip invalid json
            }
        }
    }

    return $results
}

# Safely detect if an interactive console is attached
$hasInteractiveConsole = $false
try {
    [Console]::TreatControlCAsInput = $true
    $hasInteractiveConsole = $host.UI.RawUI.KeyAvailable -ne $null
} catch {
    $hasInteractiveConsole = $false
}

try {
    $asyncContext = $listener.BeginGetContext($null, $null)

    while ($listener.IsListening) {
        # Check for keypress only if interactive console is available
        if ($hasInteractiveConsole) {
            try {
                if ([Console]::KeyAvailable) {
                    $key = [Console]::ReadKey($true)
                    if (($key.Key -eq 'C' -and ($key.Modifiers -band [ConsoleModifiers]::Control)) -or $key.Key -eq 'Q') {
                        Write-Host "`nStopping Finance Planner server..." -ForegroundColor Yellow
                        break
                    }
                }
            } catch {
                $hasInteractiveConsole = $false
            }
        }

        # Wait for request non-blocking (checks every 150ms)
        if ($asyncContext.AsyncWaitHandle.WaitOne(150)) {
            try {
                $context = $listener.EndGetContext($asyncContext)
                $request = $context.Request
                $response = $context.Response

                # Add permissive CORS headers to all responses
                $response.AddHeader("Access-Control-Allow-Origin", "*")
                $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                $response.AddHeader("Access-Control-Allow-Headers", "*")

                if ($request.HttpMethod -eq "OPTIONS") {
                    $response.StatusCode = 200
                    $response.OutputStream.Close()
                    if ($listener.IsListening) { $asyncContext = $listener.BeginGetContext($null, $null) }
                    continue
                }

                $rawPath = $request.Url.AbsolutePath

                # 1. API: Batch Quotes (/api/batch-quotes?symbols=TCS.NS,INFY.NS,AAPL)
                if ($rawPath -eq "/api/batch-quotes") {
                    $symbolsRaw = $request.QueryString["symbols"]
                    $symbolArray = if ($symbolsRaw) { $symbolsRaw.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } } else { @() }
                    $quotes = Get-YahooBatchQuotes $symbolArray
                    if ($quotes -is [System.Collections.IList]) { $quotes = $quotes | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1 }
                    $jsonString = $quotes | ConvertTo-Json -Depth 4 -Compress
                    if (-not $jsonString) { $jsonString = "{}" }
                    $response.ContentType = "application/json; charset=utf-8"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    $response.OutputStream.Close()
                }
                # 2. API: Single Quote (/api/quote?symbol=TCS.NS)
                elseif ($rawPath -eq "/api/quote") {
                    $sym = $request.QueryString["symbol"]
                    $quotes = if ($sym) { Get-YahooBatchQuotes @($sym) } else { @{} }
                    if ($quotes -is [System.Collections.IList]) { $quotes = $quotes | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1 }
                    $result = if ($sym -and $quotes -and $quotes.ContainsKey($sym.ToUpper())) { $quotes[$sym.ToUpper()] } else { @{ error = "Symbol not found" } }
                    $jsonString = $result | ConvertTo-Json -Depth 4 -Compress
                    $response.ContentType = "application/json; charset=utf-8"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonString)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    $response.OutputStream.Close()
                }
                # 3. API: Market Chart (/api/market-chart?symbol=GC=F&range=1y&interval=1wk)
                elseif ($rawPath -eq "/api/market-chart") {
                    $sym = $request.QueryString["symbol"]
                    $rng = if ($request.QueryString["range"]) { $request.QueryString["range"] } else { "1y" }
                    $intv = if ($request.QueryString["interval"]) { $request.QueryString["interval"] } else { "1wk" }
                    $clean = if ($sym) { $sym.Trim().ToUpper() } else { "GC=F" }
                    $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/$([System.Uri]::EscapeDataString($clean))?interval=$intv&range=$rng"
                    try {
                        $rawJson = $httpClient.GetStringAsync($chartUrl).Result
                    } catch {
                        $rawJson = "{""error"": ""Failed to fetch chart data""}"
                    }
                    $response.ContentType = "application/json; charset=utf-8"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($rawJson)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    $response.OutputStream.Close()
                }
                # 3. Static File Serving
                else {
                    $localPath = if ($rawPath -eq "/" -or $rawPath -eq "") {
                        Join-Path $PSScriptRoot "index.html"
                    } else {
                        Join-Path $PSScriptRoot $rawPath.TrimStart('/')
                    }

                    if (Test-Path $localPath -PathType Leaf) {
                        $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
                        $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
                        $response.ContentType = $mime
                        $bytes = [System.IO.File]::ReadAllBytes($localPath)
                        $response.ContentLength64 = $bytes.Length
                        $response.OutputStream.Write($bytes, 0, $bytes.Length)
                    } else {
                        $response.StatusCode = 404
                        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
                        $response.OutputStream.Write($msg, 0, $msg.Length)
                    }
                    $response.OutputStream.Close()
                }
            } catch {
                # ignore client disconnects
            }

            if ($listener.IsListening) {
                $asyncContext = $listener.BeginGetContext($null, $null)
            }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Write-Host "Server stopped successfully." -ForegroundColor Green
}
