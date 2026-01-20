from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import asyncio
import httpx
import ipaddress
import socket
import shutil
import subprocess
import time
from typing import Optional

app = FastAPI(title="isitdown.space API")

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

# Serve built React frontend (vite build output)
# Serve static files for GET requests only so API POSTs are routed to FastAPI endpoints.
app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")


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

