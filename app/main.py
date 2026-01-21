from fastapi import FastAPI, HTTPException, Request, Depends, Form, status
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import asyncio
import httpx
import ipaddress
import socket
import shutil
import subprocess
import time
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
from pydantic import BaseModel
import uuid

app = FastAPI(title="Isitdown? API")  # Changed from "isitdown.space API"

# Security setup for admin panel
security = HTTPBasic()

# Admin credentials (in production, store these in environment variables or a secure config)
ADMIN_USERNAME = "admin"
# Default password: "admin123" - you should change this!
ADMIN_PASSWORD_HASH = hashlib.sha256("admin123".encode()).hexdigest()

# Session management for admin login
admin_sessions: Dict[str, datetime] = {}  # session_id -> expiration time
SESSION_TIMEOUT = timedelta(hours=1)

# Simple in-memory rate limiter (per-IP, sliding window)
RATE_LIMIT = 60  # requests
RATE_PERIOD = 60  # seconds
_clients = {}

# Database setup for visitor tracking
def init_visitor_db():
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS visitors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            referrer TEXT,
            path TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            country TEXT,
            city TEXT,
            isp TEXT,
            session_id TEXT
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS visitor_stats (
            ip_address TEXT PRIMARY KEY,
            first_seen DATETIME NOT NULL,
            last_seen DATETIME NOT NULL,
            total_visits INTEGER DEFAULT 1,
            user_agent TEXT,
            country TEXT,
            city TEXT
        )
    ''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_visitors_time ON visitors (timestamp)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_visitors_ip ON visitors (ip_address)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_visitors_session ON visitors (session_id)')
    conn.commit()
    conn.close()

init_visitor_db()

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

# Visitor tracking middleware
@app.middleware("http")
async def track_visitors(request: Request, call_next):
    client_ip = request.client.host or "unknown"
    
    # Skip tracking for admin endpoints to avoid cluttering data
    if not request.url.path.startswith("/qhx-admin") and not request.url.path.startswith("/api/"):
        try:
            # Generate or get session ID from cookie
            session_id = request.cookies.get("visitor_session")
            if not session_id:
                session_id = str(uuid.uuid4())
            
            # Store visitor information
            conn = sqlite3.connect('visitors.db')
            c = conn.cursor()
            c.execute('''
                INSERT INTO visitors 
                (ip_address, user_agent, referrer, path, timestamp, session_id)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                client_ip,
                request.headers.get("user-agent", ""),
                request.headers.get("referer", ""),
                request.url.path,
                datetime.now().isoformat(),
                session_id
            ))
            
            # Update visitor stats
            c.execute('''
                INSERT OR REPLACE INTO visitor_stats 
                (ip_address, first_seen, last_seen, total_visits, user_agent)
                VALUES (
                    ?,
                    COALESCE((SELECT first_seen FROM visitor_stats WHERE ip_address = ?), ?),
                    ?,
                    COALESCE((SELECT total_visits FROM visitor_stats WHERE ip_address = ?), 0) + 1,
                    COALESCE((SELECT user_agent FROM visitor_stats WHERE ip_address = ?), ?)
                )
            ''', (
                client_ip,
                client_ip, datetime.now().isoformat(),
                datetime.now().isoformat(),
                client_ip,
                client_ip, request.headers.get("user-agent", "")
            ))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error tracking visitor: {e}")
    
    # Rate limiting
    if not client_allowed(client_ip):
        return JSONResponse({"error": "rate limit exceeded"}, status_code=429)
    
    # Call the actual endpoint
    response = await call_next(request)
    
    # Set session cookie if not already set
    if not request.url.path.startswith("/qhx-admin") and not request.url.path.startswith("/api/"):
        if not request.cookies.get("visitor_session"):
            session_id = str(uuid.uuid4())
            response.set_cookie(
                key="visitor_session",
                value=session_id,
                max_age=86400,  # 1 day
                httponly=True,
                samesite="lax"
            )
    
    return response

# Admin authentication functions
def verify_admin(credentials: HTTPBasicCredentials) -> bool:
    """Verify admin credentials"""
    username_correct = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    password_hash = hashlib.sha256(credentials.password.encode()).hexdigest()
    password_correct = secrets.compare_digest(password_hash, ADMIN_PASSWORD_HASH)
    return username_correct and password_correct

def create_admin_session() -> str:
    """Create a new admin session"""
    session_id = str(uuid.uuid4())
    admin_sessions[session_id] = datetime.now() + SESSION_TIMEOUT
    return session_id

def verify_admin_session(session_id: str) -> bool:
    """Verify if admin session is valid"""
    if session_id not in admin_sessions:
        return False
    
    # Check if session expired
    if datetime.now() > admin_sessions[session_id]:
        del admin_sessions[session_id]
        return False
    
    # Renew session
    admin_sessions[session_id] = datetime.now() + SESSION_TIMEOUT
    return True

# Admin HTML templates
ADMIN_LOGIN_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Admin Login - Isitdown?</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; }
        body { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-box { background: white; padding: 40px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 400px; }
        h1 { color: #333; margin-bottom: 10px; font-size: 28px; }
        .subtitle { color: #666; margin-bottom: 30px; font-size: 14px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 8px; color: #555; font-weight: 500; }
        input { width: 100%; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 10px; font-size: 16px; transition: border-color 0.3s; }
        input:focus { outline: none; border-color: #667eea; }
        button { width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; transition: transform 0.2s; }
        button:hover { transform: translateY(-2px); }
        .error { background: #fee; color: #c33; padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fcc; display: none; }
        .footer { margin-top: 20px; text-align: center; color: #888; font-size: 12px; }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>🔐 Admin Panel</h1>
        <p class="subtitle">Enter your credentials to access visitor statistics</p>
        
        <div class="error" id="error-message"></div>
        
        <form id="login-form">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" required autocomplete="username">
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required autocomplete="current-password">
            </div>
            <button type="submit">Login</button>
        </form>
        
        <div class="footer">
            Default credentials: admin / admin123
        </div>
    </div>
    
    <script>
        document.getElementById('login-form').onsubmit = async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorEl = document.getElementById('error-message');
            
            try {
                const response = await fetch('/qhx-admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
                });
                
                if (response.ok) {
                    window.location.href = '/qhx-admin/dashboard';
                } else {
                    const data = await response.json();
                    errorEl.textContent = data.detail || 'Login failed';
                    errorEl.style.display = 'block';
                }
            } catch (error) {
                errorEl.textContent = 'Network error. Please try again.';
                errorEl.style.display = 'block';
            }
        };
    </script>
</body>
</html>
"""

ADMIN_DASHBOARD_HTML = """
<!DOCTYPE html>
<html>
<head>
    <title>Visitor Dashboard - Isitdown?</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; }
        body { background: #f5f5f7; color: #333; min-height: 100vh; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header-content { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
        h1 { font-size: 24px; display: flex; align-items: center; gap: 10px; }
        .logout-btn { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: background 0.3s; }
        .logout-btn:hover { background: rgba(255,255,255,0.3); }
        .container { max-width: 1200px; margin: 30px auto; padding: 0 20px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .stat-card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
        .stat-card h3 { color: #666; font-size: 14px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .stat-value { font-size: 32px; font-weight: bold; color: #333; }
        .table-container { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 16px; background: #f8f9fa; color: #666; font-weight: 600; font-size: 14px; border-bottom: 2px solid #e9ecef; }
        td { padding: 16px; border-bottom: 1px solid #e9ecef; }
        tr:hover { background: #f8f9fa; }
        .ip-address { font-family: monospace; font-weight: bold; }
        .time-ago { color: #666; font-size: 13px; }
        .filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .filter-btn { background: white; border: 1px solid #ddd; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.3s; }
        .filter-btn:hover { border-color: #667eea; color: #667eea; }
        .filter-btn.active { background: #667eea; color: white; border-color: #667eea; }
        .pagination { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
        .page-btn { padding: 8px 12px; border: 1px solid #ddd; background: white; border-radius: 4px; cursor: pointer; }
        .page-btn.active { background: #667eea; color: white; border-color: #667eea; }
        .loading { text-align: center; padding: 40px; color: #666; }
        .no-data { text-align: center; padding: 40px; color: #666; }
        .session-id { font-family: monospace; font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-content">
            <h1>📊 Visitor Dashboard</h1>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </div>
    </div>
    
    <div class="container">
        <div class="stats-grid" id="stats-grid">
            <div class="stat-card">
                <h3>Total Visitors</h3>
                <div class="stat-value" id="total-visitors">0</div>
            </div>
            <div class="stat-card">
                <h3>Unique IPs</h3>
                <div class="stat-value" id="unique-ips">0</div>
            </div>
            <div class="stat-card">
                <h3>Today's Visitors</h3>
                <div class="stat-value" id="today-visitors">0</div>
            </div>
            <div class="stat-card">
                <h3>Most Active</h3>
                <div class="stat-value" id="most-active">0</div>
            </div>
        </div>
        
        <div class="filters">
            <button class="filter-btn active" onclick="setFilter('today')">Today</button>
            <button class="filter-btn" onclick="setFilter('week')">This Week</button>
            <button class="filter-btn" onclick="setFilter('month')">This Month</button>
            <button class="filter-btn" onclick="setFilter('all')">All Time</button>
        </div>
        
        <div class="table-container">
            <table id="visitors-table">
                <thead>
                    <tr>
                        <th>IP Address</th>
                        <th>User Agent</th>
                        <th>Path</th>
                        <th>Time</th>
                        <th>Session</th>
                    </tr>
                </thead>
                <tbody id="visitors-body">
                    <tr><td colspan="5" class="loading">Loading visitor data...</td></tr>
                </tbody>
            </table>
            
            <div class="pagination" id="pagination"></div>
        </div>
    </div>
    
    <script>
        let currentFilter = 'today';
        let currentPage = 1;
        const pageSize = 20;
        
        function setFilter(filter) {
            currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            currentPage = 1;
            loadData();
        }
        
        async function loadData() {
            // Load stats
            try {
                const statsRes = await fetch(`/qhx-admin/api/stats?filter=${currentFilter}`);
                const stats = await statsRes.json();
                document.getElementById('total-visitors').textContent = stats.total_visits.toLocaleString();
                document.getElementById('unique-ips').textContent = stats.unique_ips.toLocaleString();
                document.getElementById('today-visitors').textContent = stats.today_visits.toLocaleString();
                document.getElementById('most-active').textContent = stats.most_active_ip || 'N/A';
            } catch (error) {
                console.error('Error loading stats:', error);
            }
            
            // Load visitor list
            try {
                const res = await fetch(`/qhx-admin/api/visitors?filter=${currentFilter}&page=${currentPage}&limit=${pageSize}`);
                const data = await res.json();
                
                const tbody = document.getElementById('visitors-body');
                tbody.innerHTML = '';
                
                if (data.visitors.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No visitor data found</td></tr>';
                    return;
                }
                
                data.visitors.forEach(visitor => {
                    const row = tbody.insertRow();
                    
                    const ipCell = row.insertCell();
                    ipCell.innerHTML = `<div class="ip-address">${visitor.ip_address}</div>`;
                    
                    const uaCell = row.insertCell();
                    uaCell.textContent = visitor.user_agent ? 
                        visitor.user_agent.substring(0, 50) + (visitor.user_agent.length > 50 ? '...' : '') : 
                        'Unknown';
                    
                    const pathCell = row.insertCell();
                    pathCell.textContent = visitor.path;
                    
                    const timeCell = row.insertCell();
                    const time = new Date(visitor.timestamp);
                    timeCell.innerHTML = `
                        ${time.toLocaleDateString()} ${time.toLocaleTimeString()}
                        <div class="time-ago">${timeAgo(time)}</div>
                    `;
                    
                    const sessionCell = row.insertCell();
                    sessionCell.innerHTML = `<div class="session-id">${visitor.session_id.substring(0, 8)}...</div>`;
                });
                
                // Update pagination
                updatePagination(data.total_pages);
                
            } catch (error) {
                console.error('Error loading visitors:', error);
                document.getElementById('visitors-body').innerHTML = 
                    '<tr><td colspan="5" class="no-data">Error loading data</td></tr>';
            }
        }
        
        function updatePagination(totalPages) {
            const pagination = document.getElementById('pagination');
            pagination.innerHTML = '';
            
            if (totalPages <= 1) return;
            
            for (let i = 1; i <= Math.min(totalPages, 10); i++) {
                const btn = document.createElement('button');
                btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
                btn.textContent = i;
                btn.onclick = () => {
                    currentPage = i;
                    loadData();
                };
                pagination.appendChild(btn);
            }
        }
        
        function timeAgo(date) {
            const seconds = Math.floor((new Date() - date) / 1000);
            
            let interval = Math.floor(seconds / 31536000);
            if (interval >= 1) return interval + " year" + (interval === 1 ? "" : "s") + " ago";
            
            interval = Math.floor(seconds / 2592000);
            if (interval >= 1) return interval + " month" + (interval === 1 ? "" : "s") + " ago";
            
            interval = Math.floor(seconds / 86400);
            if (interval >= 1) return interval + " day" + (interval === 1 ? "" : "s") + " ago";
            
            interval = Math.floor(seconds / 3600);
            if (interval >= 1) return interval + " hour" + (interval === 1 ? "" : "s") + " ago";
            
            interval = Math.floor(seconds / 60);
            if (interval >= 1) return interval + " minute" + (interval === 1 ? "" : "s") + " ago";
            
            return Math.floor(seconds) + " second" + (seconds === 1 ? "" : "s") + " ago";
        }
        
        async function logout() {
            await fetch('/qhx-admin/logout', { method: 'POST' });
            window.location.href = '/qhx-admin';
        }
        
        // Load data on page load
        document.addEventListener('DOMContentLoaded', loadData);
        
        // Auto-refresh every 30 seconds
        setInterval(loadData, 30000);
    </script>
</body>
</html>
"""

# Admin endpoints
@app.get("/qhx-admin")
async def admin_login_page():
    """Admin login page"""
    return HTMLResponse(ADMIN_LOGIN_HTML)

@app.post("/qhx-admin/login")
async def admin_login(
    username: str = Form(...),
    password: str = Form(...),
    request: Request = None
):
    """Handle admin login"""
    credentials = HTTPBasicCredentials(username=username, password=password)
    if not verify_admin(credentials):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    
    # Create session
    session_id = create_admin_session()
    
    # Create response with redirect
    response = RedirectResponse(url="/qhx-admin/dashboard", status_code=303)
    response.set_cookie(
        key="admin_session",
        value=session_id,
        max_age=3600,  # 1 hour
        httponly=True,
        samesite="lax"
    )
    return response

@app.get("/qhx-admin/dashboard")
async def admin_dashboard(request: Request):
    """Admin dashboard page"""
    # Check session cookie
    session_id = request.cookies.get("admin_session")
    if not session_id or not verify_admin_session(session_id):
        return RedirectResponse(url="/qhx-admin")
    
    return HTMLResponse(ADMIN_DASHBOARD_HTML)

@app.post("/qhx-admin/logout")
async def admin_logout():
    """Handle admin logout"""
    response = RedirectResponse(url="/qhx-admin")
    response.delete_cookie("admin_session")
    return response

@app.get("/qhx-admin/api/stats")
async def get_visitor_stats(
    request: Request,
    filter: str = "today"
):
    """Get visitor statistics"""
    # Check session
    session_id = request.cookies.get("admin_session")
    if not session_id or not verify_admin_session(session_id):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    
    # Calculate time filter
    now = datetime.now()
    if filter == "today":
        cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif filter == "week":
        cutoff = now - timedelta(days=7)
    elif filter == "month":
        cutoff = now - timedelta(days=30)
    else:
        cutoff = datetime.min
    
    # Get stats
    c.execute('''
        SELECT COUNT(*) as total_visits, 
               COUNT(DISTINCT ip_address) as unique_ips,
               COUNT(CASE WHEN DATE(timestamp) = DATE(?) THEN 1 END) as today_visits
        FROM visitors
        WHERE timestamp >= ?
    ''', (now.isoformat(), cutoff.isoformat()))
    
    stats = c.fetchone()
    
    # Get most active IP
    c.execute('''
        SELECT ip_address, COUNT(*) as visit_count
        FROM visitors
        WHERE timestamp >= ?
        GROUP BY ip_address
        ORDER BY visit_count DESC
        LIMIT 1
    ''', (cutoff.isoformat(),))
    
    most_active = c.fetchone()
    
    conn.close()
    
    return {
        "total_visits": stats[0] if stats else 0,
        "unique_ips": stats[1] if stats else 0,
        "today_visits": stats[2] if stats else 0,
        "most_active_ip": most_active[0] if most_active else None,
        "most_active_count": most_active[1] if most_active else 0
    }

@app.get("/qhx-admin/api/visitors")
async def get_visitors(
    request: Request,
    filter: str = "today",
    page: int = 1,
    limit: int = 20
):
    """Get paginated visitor list"""
    # Check session
    session_id = request.cookies.get("admin_session")
    if not session_id or not verify_admin_session(session_id):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = sqlite3.connect('visitors.db')
    c = conn.cursor()
    
    # Calculate time filter
    now = datetime.now()
    if filter == "today":
        cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif filter == "week":
        cutoff = now - timedelta(days=7)
    elif filter == "month":
        cutoff = now - timedelta(days=30)
    else:
        cutoff = datetime.min
    
    # Get total count for pagination
    c.execute('SELECT COUNT(*) FROM visitors WHERE timestamp >= ?', (cutoff.isoformat(),))
    total_count = c.fetchone()[0]
    total_pages = (total_count + limit - 1) // limit
    
    # Get paginated visitors
    offset = (page - 1) * limit
    c.execute('''
        SELECT ip_address, user_agent, path, timestamp, session_id
        FROM visitors
        WHERE timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
    ''', (cutoff.isoformat(), limit, offset))
    
    visitors = []
    for row in c.fetchall():
        visitors.append({
            "ip_address": row[0],
            "user_agent": row[1],
            "path": row[2],
            "timestamp": row[3],
            "session_id": row[4]
        })
    
    conn.close()
    
    return {
        "visitors": visitors,
        "total_count": total_count,
        "total_pages": total_pages,
        "current_page": page,
        "page_size": limit
    }

# Existing API endpoints (unchanged)
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