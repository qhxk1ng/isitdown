from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import asyncio
import httpx
import ipaddress
import socket
import shutil
import subprocess
import time
import sqlite3
from datetime import datetime, timedelta
from typing import Optional
import aioschedule
import os

app = FastAPI(title="Isitdown? API")  # Changed from "isitdown.space API"

# Database setup for monitoring
def init_monitoring_db():
    conn = sqlite3.connect('monitoring.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS service_checks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name TEXT NOT NULL,
            domain TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            status_code INTEGER,
            response_time FLOAT,
            is_up BOOLEAN,
            error_message TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS service_stats (
            service_name TEXT PRIMARY KEY,
            total_checks INTEGER DEFAULT 0,
            successful_checks INTEGER DEFAULT 0,
            total_response_time FLOAT DEFAULT 0,
            last_check DATETIME,
            last_status BOOLEAN
        )
    ''')
    c.execute('''
        CREATE INDEX IF NOT EXISTS idx_service_time 
        ON service_checks (service_name, timestamp)
    ''')
    conn.commit()
    conn.close()

init_monitoring_db()

# List of services to monitor
MONITORED_SERVICES = [
    {"name": "Instagram", "domain": "instagram.com"},
    {"name": "YouTube", "domain": "youtube.com"},
    {"name": "Twitter", "domain": "twitter.com"},
    {"name": "Jio", "domain": "jio.com"},
    {"name": "Airtel", "domain": "airtel.in"},
    {"name": "VI Vodafone Idea", "domain": "myvi.in"},
    {"name": "SBI", "domain": "onlinesbi.sbi"},
    {"name": "UPI", "domain": "upi.org.in"},
    {"name": "OpenAI", "domain": "openai.com"},
]

async def check_single_service(service):
    """Check a single service and store results"""
    try:
        url = f"https://{service['domain']}"
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            start_time = time.time()
            response = await client.get(url, headers={
                "User-Agent": "IsItDown-Monitor/1.0"
            })
            response_time = (time.time() - start_time) * 1000  # ms
            
            is_up = response.status_code < 400
            
            # Store check result
            conn = sqlite3.connect('monitoring.db')
            c = conn.cursor()
            c.execute('''
                INSERT INTO service_checks 
                (service_name, domain, timestamp, status_code, response_time, is_up, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                service["name"],
                service["domain"],
                datetime.now().isoformat(),
                response.status_code,
                response_time,
                is_up,
                None
            ))
            
            # Update stats
            c.execute('''
                INSERT OR REPLACE INTO service_stats 
                (service_name, total_checks, successful_checks, total_response_time, last_check, last_status)
                VALUES (?, 
                    COALESCE((SELECT total_checks FROM service_stats WHERE service_name = ?), 0) + 1,
                    COALESCE((SELECT successful_checks FROM service_stats WHERE service_name = ?), 0) + ?,
                    COALESCE((SELECT total_response_time FROM service_stats WHERE service_name = ?), 0) + ?,
                    ?, ?
                )
            ''', (
                service["name"],
                service["name"],
                service["name"], 1 if is_up else 0,
                service["name"], response_time,
                datetime.now().isoformat(),
                is_up
            ))
            
            conn.commit()
            conn.close()
            
            return {
                "service": service["name"],
                "status": "up" if is_up else "down",
                "status_code": response.status_code,
                "response_time": response_time,
                "timestamp": datetime.now().isoformat()
            }
            
    except Exception as e:
        # Store failure
        conn = sqlite3.connect('monitoring.db')
        c = conn.cursor()
        c.execute('''
            INSERT INTO service_checks 
            (service_name, domain, timestamp, status_code, response_time, is_up, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            service["name"],
            service["domain"],
            datetime.now().isoformat(),
            None,
            None,
            False,
            str(e)
        ))
        
        # Update stats
        c.execute('''
            INSERT OR REPLACE INTO service_stats 
            (service_name, total_checks, successful_checks, total_response_time, last_check, last_status)
            VALUES (?, 
                COALESCE((SELECT total_checks FROM service_stats WHERE service_name = ?), 0) + 1,
                COALESCE((SELECT successful_checks FROM service_stats WHERE service_name = ?), 0) + 0,
                COALESCE((SELECT total_response_time FROM service_stats WHERE service_name = ?), 0) + 0,
                ?, ?
            )
        ''', (
            service["name"],
            service["name"],
            service["name"],
            service["name"],
            datetime.now().isoformat(),
            False
        ))
        
        conn.commit()
        conn.close()
        
        return {
            "service": service["name"],
            "status": "down",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

async def run_service_checks():
    """Run checks for all monitored services"""
    print(f"[{datetime.now()}] Running scheduled service checks...")
    tasks = [check_single_service(service) for service in MONITORED_SERVICES]
    results = await asyncio.gather(*tasks)
    
    # Log summary
    up_count = sum(1 for r in results if r.get("status") == "up")
    print(f"[{datetime.now()}] Check complete: {up_count}/{len(results)} services up")
    return results

async def schedule_checks():
    """Setup scheduled checks"""
    # Run immediately on startup
    await run_service_checks()
    
    # Schedule every 5 minutes
    aioschedule.every(5).minutes.do(lambda: asyncio.create_task(run_service_checks()))
    
    # Keep scheduler running
    while True:
        await aioschedule.run_pending()
        await asyncio.sleep(1)

# Simple in-memory rate limiter (per-IP, sliding window) - kept as fallback
RATE_LIMIT = int(os.getenv("RATE_LIMIT_PER_MIN", "120"))  # tokens per minute
RATE_PERIOD = 60  # seconds
_clients = {}

def client_allowed(ip: str) -> bool:
    """Fallback in-memory sliding window limiter"""
    now = time.time()
    q = _clients.setdefault(ip, [])
    while q and q[0] <= now - RATE_PERIOD:
        q.pop(0)
    if len(q) >= RATE_LIMIT:
        return False
    q.append(now)
    return True

# Redis-backed token-bucket limiter (preferred)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
_redis = None

try:
    import redis.asyncio as redis  # type: ignore
except Exception:
    redis = None

TOKEN_BUCKET_LUA = r"""
local key=KEYS[1]
local capacity=tonumber(ARGV[1])
local refill_per_ms=tonumber(ARGV[2])
local now=tonumber(ARGV[3])
local requested=tonumber(ARGV[4])
local data=redis.call('HMGET', key, 'tokens', 'ts')
local tokens=data[1]
local ts=data[2]
if tokens==false or tokens==nil then
  tokens=capacity
  ts=now
else
  tokens=tonumber(tokens)
  ts=tonumber(ts)
end
local delta = math.max(0, now - ts)
local refill = delta * refill_per_ms
tokens = math.min(capacity, tokens + refill)
if tokens < requested then
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
  redis.call('PEXPIRE', key, 60000)
  return 0
else
  tokens = tokens - requested
  redis.call('HMSET', key, 'tokens', tokens, 'ts', now)
  redis.call('PEXPIRE', key, 60000)
  return 1
end
"""

async def redis_allow(ip: str, capacity: int = None, per_min: int = None) -> bool:
    """Use Redis token bucket to decide if request is allowed. Returns True if allowed."""
    global _redis
    if redis is None or _redis is None:
        return True
    try:
        cap = capacity or RATE_LIMIT
        per_min = per_min or RATE_LIMIT
        refill_per_ms = float(per_min) / 60.0 / 1000.0
        now_ms = int(time.time() * 1000)
        key = f"rl:{ip}"
        allowed = await _redis.eval(TOKEN_BUCKET_LUA, 1, key, cap, refill_per_ms, now_ms, 1)
        return bool(int(allowed))
    except Exception:
        return True


@app.on_event("startup")
async def startup_redis():
    global _redis
    if redis is None:
        _redis = None
        return
    try:
        _redis = redis.from_url(REDIS_URL)
        await _redis.ping()
    except Exception:
        _redis = None


@app.on_event("shutdown")
async def shutdown_redis():
    global _redis
    if _redis:
        try:
            await _redis.close()
        except Exception:
            pass
        _redis = None

def is_private_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            addr = info[4][0]
            ip = ipaddress.ip_address(addr)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return True
        return False
    except Exception:
        return True  # be conservative on resolution failure

@app.middleware("http")
async def ip_rate_limit(request: Request, call_next):
    client = request.client.host or "unknown"
    # Try Redis-backed limiter first
    try:
        allowed = await redis_allow(client)
    except Exception:
        allowed = True
    if not allowed:
        return JSONResponse({"error": "rate limit exceeded"}, status_code=429)
    # If Redis unavailable, fallback to in-memory limiter
    if _redis is None:
        if not client_allowed(client):
            return JSONResponse({"error": "rate limit exceeded"}, status_code=429)
    return await call_next(request)

@app.post("/api/http")
async def do_http(target: dict):
    """
    JSON body: { "url": "...", "method": "GET", "timeout": 10, "verbose": false }
    """
    url = target.get("url")
    method = target.get("method", "GET").upper()
    timeout = float(target.get("timeout", 10))
    verbose = bool(target.get("verbose", False))
    if not url:
        raise HTTPException(400, "url is required")
    # Block private hosts
    host = url.split("/")[2] if "://" in url else url
    host = host.split(":")[0]
    if is_private_host(host):
        raise HTTPException(400, "target resolves to a private or local address")

    headers = target.get("headers") or {}
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        try:
            resp = await client.request(method, url, headers=headers)
        except httpx.RequestError as e:
            raise HTTPException(502, f"request failed: {e}")

    data = {
        "status_code": resp.status_code,
        "headers": dict(resp.headers),
    }
    body = resp.text
    if not verbose:
        if len(body) > 2000:
            body = body[:2000] + "\n\n...truncated..."
    data["body"] = body
    return JSONResponse(data)

@app.post("/api/port")
async def check_port(payload: dict):
    """
    JSON body: { "host": "...", "port": 80, "timeout": 5 }
    """
    host = payload.get("host")
    port = int(payload.get("port", 80))
    timeout = float(payload.get("timeout", 5))
    if not host:
        raise HTTPException(400, "host is required")
    if is_private_host(host):
        raise HTTPException(400, "target resolves to a private or local address")

    try:
        fut = asyncio.open_connection(host, port)
        start = time.time()
        reader, writer = await asyncio.wait_for(fut, timeout=timeout)
        latency = (time.time() - start) * 1000.0
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"open": True, "latency_ms": latency}
    except asyncio.TimeoutError:
        return {"open": False, "error": "timeout"}
    except Exception as e:
        return {"open": False, "error": str(e)}

@app.post("/api/nmap")
async def run_nmap(payload: dict):
    """
    Restricted nmap-style scan for service checking.
    JSON body: { "host": "...", "top_ports": 100, "timeout": 30 }
    Notes: This endpoint runs the system 'nmap' binary and therefore requires nmap installed.
    It explicitly forbids OS detection flags and limits scan to TCP connect (--top-ports).
    """
    host = payload.get("host")
    top_ports = int(payload.get("top_ports", 100))
    timeout = int(payload.get("timeout", 30))
    if not host:
        raise HTTPException(400, "host is required")
    if top_ports <= 0 or top_ports > 1000:
        raise HTTPException(400, "top_ports must be between 1 and 1000")
    if is_private_host(host):
        raise HTTPException(400, "target resolves to a private or local address")

    nmap_path = shutil.which("nmap")
    if not nmap_path:
        raise HTTPException(400, "nmap binary not found on server")

    # Whitelist of args we will pass (we construct command ourselves)
    cmd = [
        nmap_path,
        "-sT",  # TCP connect scan only (no raw packets / OS fingerprint)
        "--top-ports",
        str(top_ports),
        "--open",
        host,
    ]

    try:
        proc = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "nmap timed out")
    except Exception as e:
        raise HTTPException(500, f"failed to run nmap: {e}")

    out = proc.stdout or ""
    err = proc.stderr or ""
    return {"cmd": cmd, "stdout": out, "stderr": err, "returncode": proc.returncode}

@app.get("/api/nmap/stream")
async def stream_nmap(host: str, top_ports: int = 100):
    """
    Stream nmap stdout as Server-Sent Events.
    GET params: host, top_ports
    """
    if not host:
        raise HTTPException(400, "host is required")
    if top_ports <= 0 or top_ports > 1000:
        raise HTTPException(400, "top_ports must be between 1 and 1000")
    if is_private_host(host):
        raise HTTPException(400, "target resolves to a private or local address")

    nmap_path = shutil.which("nmap")
    if not nmap_path:
        raise HTTPException(400, "nmap binary not found on server")

    cmd = [
        nmap_path,
        "-sT",
        "--top-ports",
        str(top_ports),
        "--open",
        host,
    ]

    async def event_stream():
        # spawn subprocess and stream stdout lines as SSE data events
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        try:
            # send a start event
            yield f"data: __START__\n\n"
            buf = b""
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                # forward line
                text = line.decode(errors="replace").rstrip("\n")
                yield f"data: {text}\n\n"
                buf += line
            await proc.wait()
            # send done with returncode and any stderr
            stderr = (await proc.stderr.read()).decode(errors="replace")
            done_payload = {"returncode": proc.returncode, "stderr": stderr}
            yield f"data: __DONE__ {done_payload}\n\n"
        except Exception as e:
            yield f"data: __ERROR__ {str(e)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")

# API endpoints for monitoring
@app.get("/api/service/{service_name}/status")
async def get_service_status(service_name: str):
    """Get current status of a service"""
    conn = sqlite3.connect('monitoring.db')
    c = conn.cursor()
    
    # Get latest check
    c.execute('''
        SELECT timestamp, is_up, status_code, response_time, error_message
        FROM service_checks 
        WHERE service_name = ?
        ORDER BY timestamp DESC
        LIMIT 1
    ''', (service_name,))
    
    latest = c.fetchone()
    
    if not latest:
        conn.close()
        return {"error": "No data available"}
    
    # Get stats
    c.execute('''
        SELECT total_checks, successful_checks, total_response_time, last_status
        FROM service_stats 
        WHERE service_name = ?
    ''', (service_name,))
    
    stats = c.fetchone()
    conn.close()
    
    timestamp, is_up, status_code, response_time, error_message = latest
    
    if stats:
        total_checks, successful_checks, total_response_time, last_status = stats
        uptime_percentage = (successful_checks / total_checks * 100) if total_checks > 0 else 0
        avg_response_time = total_response_time / successful_checks if successful_checks > 0 else 0
    else:
        uptime_percentage = 0
        avg_response_time = 0
    
    return {
        "service": service_name,
        "status": "up" if is_up else "down",
        "is_up": is_up,
        "status_code": status_code,
        "response_time": response_time,
        "timestamp": timestamp,
        "uptime_percentage": round(uptime_percentage, 2),
        "avg_response_time": round(avg_response_time, 2),
        "error": error_message
    }

@app.get("/api/service/{service_name}/history")
async def get_service_history(service_name: str, hours: int = 24):
    """Get historical data for graphing"""
    conn = sqlite3.connect('monitoring.db')
    c = conn.cursor()
    
    cutoff = datetime.now() - timedelta(hours=hours)
    
    # Get hourly aggregated data
    c.execute('''
        SELECT 
            strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
            COUNT(*) as total_checks,
            SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) as up_checks,
            AVG(CASE WHEN is_up = 1 THEN response_time ELSE NULL END) as avg_response_time
        FROM service_checks 
        WHERE service_name = ? AND timestamp >= ?
        GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
        ORDER BY hour
    ''', (service_name, cutoff.isoformat()))
    
    data = []
    now = datetime.now()
    
    # Create data for last 24 hours
    for hour_offset in range(24):
        hour_time = now - timedelta(hours=hour_offset)
        hour_key = hour_time.strftime('%Y-%m-%d %H:00:00')
        
        # Find matching data
        matching_data = None
        c.execute('''
            SELECT hour, total_checks, up_checks, avg_response_time
            FROM (
                SELECT 
                    strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                    COUNT(*) as total_checks,
                    SUM(CASE WHEN is_up = 1 THEN 1 ELSE 0 END) as up_checks,
                    AVG(CASE WHEN is_up = 1 THEN response_time ELSE NULL END) as avg_response_time
                FROM service_checks 
                WHERE service_name = ? AND timestamp >= ?
                GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
            ) WHERE hour = ?
        ''', (service_name, cutoff.isoformat(), hour_key))
        
        row = c.fetchone()
        
        if row:
            hour_str, total_checks, up_checks, avg_response_time = row
            downtime_ratio = (total_checks - up_checks) / total_checks if total_checks > 0 else 0
            downtime_minutes = downtime_ratio * 60
        else:
            downtime_minutes = 0
            avg_response_time = 0
            total_checks = 0
        
        data.insert(0, {
            "hour": hour_time.hour,
            "hour_display": hour_time.strftime('%I %p').lstrip('0'),
            "downtime_minutes": round(downtime_minutes, 1),
            "avg_response_time": round(avg_response_time or 0, 1),
            "checks": total_checks,
            "timestamp": hour_time.isoformat()
        })
    
    conn.close()
    
    # Calculate overall stats
    total_downtime = sum(item["downtime_minutes"] for item in data)
    total_checks = sum(item["checks"] for item in data)
    downtime_percentage = (total_downtime / (60 * len(data))) * 100 if len(data) > 0 else 0
    
    return {
        "service": service_name,
        "data": data,
        "summary": {
            "downtime_percentage": round(downtime_percentage, 2),
            "total_downtime": round(total_downtime, 2),
            "total_checks": total_checks,
            "monitoring_period_hours": hours
        }
    }

@app.get("/api/services/status")
async def get_all_services_status():
    """Get status of all monitored services"""
    results = []
    for service in MONITORED_SERVICES:
        try:
            status_data = await get_service_status(service["name"])
            if "error" not in status_data:
                results.append(status_data)
        except:
            continue
    
    return results

# Load SPA template (dist build preferred, fallback to source index)
TEMPLATE_PATHS = ["frontend/dist/index.html", "frontend/index.html"]
_TEMPLATE_CONTENT = None

def load_template():
    global _TEMPLATE_CONTENT
    if _TEMPLATE_CONTENT is not None:
        return _TEMPLATE_CONTENT
    for p in TEMPLATE_PATHS:
        try:
            with open(p, "r", encoding="utf-8") as f:
                _TEMPLATE_CONTENT = f.read()
                return _TEMPLATE_CONTENT
        except FileNotFoundError:
            continue
    raise RuntimeError("index.html template not found in frontend/dist or frontend/")

def render_index(route: str):
    tpl = load_template()
    # defaults
    meta = {
        "title": "Isitdown? - Free Online Service Checker, Port Scanner & HTTP Tester",
        "description": "Free online website checker, port scanner, HTTP tester, and service monitor. Check if websites are down, scan ports with online nmap, test APIs with curl-like tool. No installation required.",
        "og_title": "Isitdown? - Free Online Service Checker & Port Scanner",
        "og_description": "Check if websites are down, scan ports with online nmap tool, test HTTP requests with curl-like interface. Free and easy to use.",
        "canonical": "https://isitdown.space/",
    }
    if route == "curl":
        meta.update({
            "title": "Curl - Online HTTP tester | Isitdown?",
            "description": "Online curl tool: send HTTP requests, set headers, and inspect responses. A lightweight curl-like interface in the browser.",
            "og_title": "Curl - Online HTTP tester",
            "og_description": "Use the online curl tester to send GET/POST requests, inspect headers and responses. No install required.",
            "canonical": "https://isitdown.space/curl",
        })
    elif route == "port-scan":
        meta.update({
            "title": "Port Scan - Online Nmap & Port Scanner | Isitdown?",
            "description": "Online port scanner using TCP-connect scans. Check open ports and services on hosts quickly and safely.",
            "og_title": "Port Scan - Online Nmap",
            "og_description": "Run restricted TCP connect port scans (no OS detection) to discover open services.",
            "canonical": "https://isitdown.space/port-scan",
        })
    elif route == "status":
        meta.update({
            "title": "Status Checker - Is my site down? | Isitdown?",
            "description": "Quick website status checker: test HTTP endpoints and ports to see if your site or server is up.",
            "og_title": "Status Checker - Website status",
            "og_description": "Instantly check whether a website or server is up or down with our quick status tool.",
            "canonical": "https://isitdown.space/status",
        })
    elif route == "monitor":  # Added for monitoring page
        meta.update({
            "title": "Service Monitor - Real-time Status Dashboard | Isitdown?",
            "description": "Real-time monitoring dashboard for popular services. Track uptime, response times, and historical data for Instagram, YouTube, Twitter, Jio, Airtel, and more.",
            "og_title": "Service Monitor - Real-time Status Dashboard",
            "og_description": "Monitor popular services including social media, telecom providers, and banking services with real-time status updates and historical graphs.",
            "canonical": "https://isitdown.space/monitor",
        })

    # Simple replacements
    out = tpl
    out = out.replace(
        "<title>Isitdown? - Free Online Service Checker, Port Scanner & HTTP Tester</title>",
        f"<title>{meta['title']}</title>",
    )
    out = out.replace(
        '<meta name="description" content="Free online website checker, port scanner, HTTP tester, and service monitor. Check if websites are down, scan ports with online nmap, test APIs with curl-like tool. No installation required.">',
        f'<meta name="description" content="{meta["description"]}">',
    )
    out = out.replace(
        '<meta property="og:title" content="Isitdown? - Free Online Service Checker & Port Scanner">',
        f'<meta property="og:title" content="{meta["og_title"]}">',
    )
    out = out.replace(
        '<meta property="og:description" content="Check if websites are down, scan ports with online nmap tool, test HTTP requests with curl-like interface. Free and easy to use.">',
        f'<meta property="og:description" content="{meta["og_description"]}">',
    )
    out = out.replace(
        '<link rel="canonical" href="https://isitdown.space/">',
        f'<link rel="canonical" href="{meta["canonical"]}">',
    )
    return out

# SEO-friendly routes with per-route meta injection
@app.get("/curl", response_class=HTMLResponse)
async def curl_page():
    return HTMLResponse(render_index("curl"))

@app.get("/port-scan", response_class=HTMLResponse)
async def port_scan_page():
    return HTMLResponse(render_index("port-scan"))

@app.get("/status", response_class=HTMLResponse)
async def status_page():
    return HTMLResponse(render_index("status"))

@app.get("/monitor", response_class=HTMLResponse)  # Added monitoring page
async def monitor_page():
    return HTMLResponse(render_index("monitor"))

# Serve built React frontend (vite build output) - mount last so API routes take precedence
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

@app.on_event("startup")
async def startup_event():
    """Start scheduled monitoring on app startup"""
    asyncio.create_task(schedule_checks())