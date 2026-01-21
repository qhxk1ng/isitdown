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
from typing import Optional

app = FastAPI(title="Isitdown? API")  # Changed from "isitdown.space API"

# Simple in-memory rate limiter (per-IP, sliding window)
RATE_LIMIT = 60  # requests
RATE_PERIOD = 60  # seconds
_clients = {}

def client_allowed(ip: str) -> bool:
    now = time.time()
    q = _clients.setdefault(ip, [])
    # drop old
    while q and q[0] <= now - RATE_PERIOD:
        q.pop(0)
    if len(q) >= RATE_LIMIT:
        return False
    q.append(now)
    return True

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

# Serve built React frontend (vite build output) - mount last so API routes take precedence
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")

