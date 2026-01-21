import React, { useState, useEffect, useRef } from "react";
import Nav from "./components/Nav";
// Chart.js for nicer graphs
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function App() {
  const [output, setOutput] = useState("Enter a URL or host to check status");
  const [target, setTarget] = useState("");
  const [verbose, setVerbose] = useState(false);
  function mapPathToTab(path) {
    if (!path) return "isitdown";
    if (path.startsWith("/port-scan")) return "scanner";
    if (path.startsWith("/curl")) return "curl";
    if (path.startsWith("/status")) return "isitdown";
    return "home";
  }
  const [activeTab, setActiveTab] = useState(mapPathToTab(window.location.pathname));
  const [curlMethod, setCurlMethod] = useState("GET");
  const [curlHeaders, setCurlHeaders] = useState("");
  const [topPorts, setTopPorts] = useState(100);
  const [protocol, setProtocol] = useState("https");
  const [liveStream, setLiveStream] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamPorts, setStreamPorts] = useState([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'up', 'down', or null
  const [checkType, setCheckType] = useState(null); // 'website' or 'port'
  const [responseTime, setResponseTime] = useState(null);
  const esRef = useRef(null);

  // Clear output and stop any streaming when changing tabs
  useEffect(() => {
    setOutput("Enter a URL or host to check status");
    setStreamPorts([]);
    setStreamBuffer("");
    setLoading(false);
    setStatus(null);
    setCheckType(null);
    setResponseTime(null);
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (e) {}
      esRef.current = null;
    }
    setStreaming(false);
  }, [activeTab]);

  // listen for back/forward navigation and update active tab
  useEffect(() => {
    const onPop = () => {
      setActiveTab(mapPathToTab(window.location.pathname));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Batch fetch statuses for all services to avoid per-card requests (reduce rate limit pressure)
  const [servicesStatusMap, setServicesStatusMap] = useState({});
  // safe fetch with automatic exponential backoff for 429 responses
  async function safeFetch(input, init = {}, retries = 4, backoff = 600) {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(input, init);
        if (res.status !== 429) return res;
        // 429 -> wait and retry
        const wait = backoff * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      } catch (e) {
        if (i === retries) throw e;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw new Error("rate limited");
  }
  useEffect(() => {
    let mounted = true;
    async function loadAllStatuses() {
      try {
        const res = await safeFetch("/api/services/status");
        if (!res.ok) return;
        const arr = await res.json();
        if (!mounted) return;
        const map = {};
        for (const s of arr) {
          map[s.service] = s;
        }
        setServicesStatusMap(map);
      } catch (e) {
        console.debug("failed to load services status", e);
      }
    }
    loadAllStatuses();
    const iv = setInterval(loadAllStatuses, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  async function postJSON(path, body) {
    setLoading(true);
    setStatus(null);
    setCheckType(path === "/api/http" ? "website" : "port");
    setResponseTime(null);
    setOutput("Checking...");
    
    const startTime = performance.now();
    
    try {
        const res = await safeFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      const endTime = performance.now();
      const elapsed = endTime - startTime;
      setResponseTime(elapsed.toFixed(0));
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      // For Quick Check tab, show simple up/down status
      if (activeTab === "isitdown") {
        if (path === "/api/http") {
          if (data.status_code && data.status_code >= 200 && data.status_code < 400) {
            setStatus('up');
            setOutput({
              type: 'website',
              status: 'up',
              statusCode: data.status_code,
              responseTime: elapsed.toFixed(0),
              details: `Website responded with status ${data.status_code}`
            });
          } else {
            setStatus('down');
            setOutput({
              type: 'website',
              status: 'down',
              statusCode: data.status_code,
              responseTime: elapsed.toFixed(0),
              details: `Website returned status ${data.status_code}`
            });
          }
        } else if (path === "/api/port") {
          if (data.open) {
            setStatus('up');
            setOutput({
              type: 'port',
              status: 'up',
              latency: data.latency_ms,
              responseTime: elapsed.toFixed(0),
              details: `Port responded in ${data.latency_ms?.toFixed(2)}ms`
            });
          } else {
            setStatus('down');
            setOutput({
              type: 'port',
              status: 'down',
              error: data.error,
              responseTime: elapsed.toFixed(0),
              details: `Port is closed or unreachable`
            });
          }
        }
      } else {
        // For other tabs, show full output
        if (data && typeof data.stdout === "string" && data.stdout.includes("PORT")) {
          const ports = parseNmap(data.stdout);
          setOutput({ nmapPorts: ports });
        } else {
          setOutput(JSON.stringify(data, null, 2));
        }
      }
    } catch (e) {
      const endTime = performance.now();
      const elapsed = endTime - startTime;
      setResponseTime(elapsed.toFixed(0));
      setStatus('down');
      setCheckType(path === "/api/http" ? "website" : "port");
      setOutput({
        type: path === "/api/http" ? "website" : "port",
        status: 'down',
        error: e.message,
        responseTime: elapsed.toFixed(0),
        details: `Failed to connect: ${e.message}`
      });
    } finally {
      setLoading(false);
    }
  }

  function parseNmap(raw) {
    const lines = raw.split("\n");
    const ports = [];
    let inTable = false;
    for (const line of lines) {
      if (!inTable) {
        if (line.trim().startsWith("PORT")) {
          inTable = true;
        }
        continue;
      }
      const l = line.trim();
      if (!l) continue;
      // Expected format: "21/tcp   open  ftp"
      const parts = l.split(/\s+/);
      if (parts.length >= 3) {
        const [portProto, state, service] = parts;
        const [portStr, proto] = portProto.split("/");
        const port = Number(portStr);
        ports.push({ port, proto, state, service });
      }
    }
    return ports;
  }

  function ServiceCard({ name, domain, initialStatus }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [historyData, setHistoryData] = useState([]);
    const [uptimePercentage, setUptimePercentage] = useState(0);
    const [avgResponseTime, setAvgResponseTime] = useState(0);
    const [lastChecked, setLastChecked] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
  
    // Initialize from batch-loaded status if provided; otherwise fetch once on mount.
    useEffect(() => {
      let mounted = true;
      if (initialStatus) {
        setStatus(initialStatus.is_up ? "up" : "down");
        setUptimePercentage(initialStatus.uptime_percentage || 0);
        setAvgResponseTime(initialStatus.avg_response_time || 0);
        setLastChecked(initialStatus.timestamp || null);
      } else {
        // fetch status once if no initial status
        (async () => {
          try {
            const res = await safeFetch(`/api/service/${encodeURIComponent(name)}/status`);
            if (!res.ok) return;
            const d = await res.json();
            if (!mounted) return;
            setStatus(d.is_up ? "up" : "down");
            setUptimePercentage(d.uptime_percentage || 0);
            setAvgResponseTime(d.avg_response_time || 0);
            setLastChecked(d.timestamp || null);
          } catch (e) {
            console.debug("failed to fetch status", e);
          }
        })();
      }
      // Refresh visible status periodically from global map (App-level) via prop changes
      return () => { mounted = false; };
    }, [initialStatus, name]);
  
    const loadServiceData = async () => {
      try {
        // Get current status
        const statusRes = await safeFetch(`/api/service/${encodeURIComponent(name)}/status`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData.is_up ? 'up' : 'down');
          setUptimePercentage(statusData.uptime_percentage || 0);
          setAvgResponseTime(statusData.avg_response_time || 0);
          setLastChecked(statusData.timestamp);
        }
  
        // (histories are loaded on demand when user expands 'Show history')
      } catch (error) {
        console.error("Failed to load service data:", error);
      }
    };
  
    const checkServiceNow = async () => {
      setLoading(true);
      try {
        const res = await safeFetch("/api/http", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            url: `https://${domain}`, 
            timeout: 5, 
            verbose: false 
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status_code >= 200 && data.status_code < 400 ? 'up' : 'down');
        } else {
          setStatus('down');
        }
        // Refresh data after manual check
        setTimeout(() => {
          // refresh status via parent batch fetch by triggering a global refetch - simple approach: call services endpoint
          safeFetch("/api/services/status").then(r=>r.ok && r.json().then(arr=> {
            const map = {};
            for (const s of arr) map[s.service]=s;
            // update local fields if this service present
            if (map[name]) {
              const s = map[name];
              setStatus(s.is_up ? 'up' : 'down');
              setUptimePercentage(s.uptime_percentage || 0);
              setAvgResponseTime(s.avg_response_time || 0);
              setLastChecked(s.timestamp || null);
            }
          })).catch(()=>{});
        }, 1000);
      } catch (e) {
        setStatus('down');
      } finally {
        setLoading(false);
      }
    };
  
    // Find max downtime for scaling graph
    const maxDowntime = historyData.length > 0 
      ? Math.max(...historyData.map(d => d.downtime_minutes), 1) 
      : 1;
  
    return (
      <div className={`service-card ${status || 'idle'}`} onClick={checkServiceNow}>
        <div className="service-header">
          <div className="service-icon">
            {loading ? (
              <div className="service-loading"></div>
            ) : status === 'up' ? (
              <span className="status-dot up"></span>
            ) : status === 'down' ? (
              <span className="status-dot down"></span>
            ) : (
              <span className="status-dot idle"></span>
            )}
          </div>
          <div className="service-info">
            <div className="service-name">{name}</div>
            <div className="service-domain">{domain}</div>
            <div className="service-status">
              {loading ? 'Checking...' : status === 'up' ? '✓ Online' : status === 'down' ? '✗ Offline' : 'Loading...'}
            </div>
          </div>
        </div>
        
        <div className="service-metrics">
          <div className="metric-row">
            <span className="metric-label">Uptime</span>
            <span className="metric-value">{uptimePercentage.toFixed(1)}%</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Avg Response</span>
            <span className="metric-value">{avgResponseTime.toFixed(0)}ms</span>
          </div>
        </div>
        
        <div className="downtime-graph">
          <div className="graph-title">24h Overview</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={async () => {
              if (showHistory) { setShowHistory(false); return; }
              // load history on demand
              try {
                setLoading(true);
                const hres = await safeFetch(`/api/service/${encodeURIComponent(name)}/history?hours=24`);
                if (hres.ok) {
                  const json = await hres.json();
                  setHistoryData(json.data || []);
                }
              } catch (e) {
                console.debug("failed to load history", e);
              } finally {
                setLoading(false);
                setShowHistory(true);
              }
            }}>{showHistory ? "Hide history" : "Show history"}</button>
            <div style={{ color: "var(--muted)" }}>{uptimePercentage.toFixed(1)}% uptime · Avg {avgResponseTime.toFixed(0)}ms</div>
          </div>
          {showHistory && (
            <div className="chart-container" style={{ height: 180, marginTop: 12 }}>
              {historyData && historyData.length > 0 ? (
                <Chart
                  type="bar"
                  data={{
                    labels: historyData.map((h) => h.hour_display || h.hour),
                    datasets: [
                      {
                        type: "bar",
                        label: "Downtime (min)",
                        data: historyData.map((h) => h.downtime_minutes || 0),
                        yAxisID: "yDowntime",
                        backgroundColor: historyData.map((h) => (h.downtime_minutes && h.downtime_minutes > 0 ? "#ef4444" : "#10b981")),
                        borderRadius: 6,
                        barPercentage: 0.7,
                      },
                      {
                        type: "line",
                        label: "Avg response (ms)",
                        data: historyData.map((h) => h.avg_response_time || 0),
                        yAxisID: "yResp",
                        borderColor: "#60a5fa",
                        backgroundColor: "rgba(96,165,250,0.12)",
                        tension: 0.3,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        order: 0,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: "top", labels: { usePointStyle: true } },
                      tooltip: { mode: "index", intersect: false },
                      title: { display: false },
                    },
                    interaction: { mode: "index", intersect: false },
                    scales: {
                      x: { grid: { display: false } },
                      yResp: {
                        type: "linear",
                        position: "left",
                        grid: { color: "rgba(255,255,255,0.03)" },
                        ticks: { color: "#cfe8ff" },
                        title: { display: true, text: "ms", color: "#cfe8ff" },
                      },
                      yDowntime: {
                        type: "linear",
                        position: "right",
                        grid: { drawOnChartArea: false },
                        ticks: { color: "#cfe8ff" },
                        title: { display: true, text: "min", color: "#cfe8ff" },
                      },
                    },
                  }}
                />
              ) : (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: 20 }}>No historical data</div>
              )}
            </div>
          )}
        </div>
        
        {lastChecked && (
          <div className="last-checked">
            Last checked: {new Date(lastChecked).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </div>
        )}
      </div>
    );
  }

  function serviceIcon(name) {
    if (!name) return "UNK";
    const n = String(name).toUpperCase();
    const map = {
      FTP: "FTP",
      SSH: "SSH",
      TELNET: "TEL",
      SMTP: "SMTP",
      DOMAIN: "DNS",
      HTTP: "HTTP",
      HTTPS: "HTTPS",
      POP3: "POP3",
      IMAP: "IMAP",
      MYSQL: "SQL",
      POSTGRESQL: "PG",
      REDIS: "RDS",
      MONGODB: "MDB",
      RDP: "RDP",
      VNC: "VNC",
      SNMP: "SNMP",
      LDAP: "LDAP",
    };
    return map[n] || n.slice(0, 3);
  }

  function startStream(host, ports) {
    if (!host) {
      setOutput("Please enter a host");
      return;
    }
    setStreaming(true);
    setStreamPorts([]);
    setStreamBuffer("");
    const url = `/api/nmap/stream?host=${encodeURIComponent(host)}&top_ports=${ports}`;
    const es = new EventSource(url);
    esRef.current = es;
    
    es.onmessage = (e) => {
      const d = e.data;
      if (!d) return;
      
      if (d.startsWith("__DONE__")) {
        setStreaming(false);
        try {
          const payload = JSON.parse(d.slice(9));
          if (payload.returncode !== 0) {
            setOutput(`Scan completed with errors:\n${payload.stderr}`);
          }
        } catch (err) {
          // Ignore parse errors
        }
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        return;
      }
      
      if (d.startsWith("__ERROR__")) {
        setOutput(`Stream error: ${d.slice(10)}`);
        setStreaming(false);
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        return;
      }
      
      // Append to buffer and parse
      setStreamBuffer((prev) => {
        const next = prev + (prev ? "\n" : "") + d;
        const portsParsed = parseNmap(next);
        if (portsParsed.length > 0) {
          setStreamPorts(portsParsed);
        }
        return next;
      });
    };
    
    es.onerror = (err) => {
      setOutput("Stream connection lost");
      setStreaming(false);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }

  return (
    <div className="app">
      <header className="hero" role="banner">
        <div className="hero-inner">
          <h1 className="brand">isitdown.space</h1>
          <Nav active={activeTab} onChange={setActiveTab} />
          <p className="tag">Quick checks for websites, servers and services</p>
        </div>
      </header>

      <main className="container">
        <div>
          <section className="card">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <select
                className="protocol-select"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                aria-label="Protocol"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
              </select>
              <input
                className="target"
                placeholder="example.com or example.com:80"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && activeTab === 'isitdown') {
                    const url = target.includes("://") ? target : `${protocol}://${target}`;
                    postJSON("/api/http", { url, timeout: 10, verbose });
                  }
                }}
                aria-label="Target host or URL"
              />
            </div>

            {activeTab === "isitdown" && (
              <div className="controls" role="group" aria-label="Quick check tools">
                <button 
                  onClick={() => {
                    const url = target.includes("://") ? target : `${protocol}://${target}`;
                    postJSON("/api/http", { url, timeout: 10, verbose });
                  }}
                  disabled={loading || !target.trim()}
                  className={loading ? "pulse" : ""}
                  aria-label="Check if website is up or down"
                >
                  {loading ? "Checking..." : "Check Website"}
                </button>
                <button
                  onClick={() => {
                    let host = target;
                    let port = 80;
                    if (target.includes(":")) {
                      const parts = target.split(":");
                      host = parts[0];
                      port = Number(parts[1] || 80);
                    }
                    postJSON("/api/port", { host, port, timeout: 5 });
                  }}
                  disabled={loading || !target.trim()}
                  className={loading ? "pulse" : ""}
                  aria-label="Check port status"
                >
                  Check Port
                </button>
                <label className="chk">
                  <input 
                    type="checkbox" 
                    checked={verbose} 
                    onChange={(e) => setVerbose(e.target.checked)} 
                    aria-label="Show detailed output"
                  />
                  Details
                </label>
              </div>
            )}

            {/* Rest of the controls for other tabs remain the same */}
            {activeTab === "scanner" && (
              <div className="controls" role="group" aria-label="Port scanner tools">
                <label className="chk">
                  Top Ports:
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={topPorts}
                    onChange={(e) => setTopPorts(Math.min(1000, Math.max(1, Number(e.target.value) || 100)))}
                    style={{ width: 80 }}
                    aria-label="Number of top ports to scan"
                  />
                </label>
                <label className="chk">
                  Live Stream:
                  <input
                    type="checkbox"
                    checked={liveStream}
                    onChange={(e) => setLiveStream(e.target.checked)}
                    aria-label="Enable live streaming results"
                  />
                </label>
                {!liveStream && (
                  <button 
                    onClick={() => postJSON("/api/nmap", { host: target, top_ports: topPorts, timeout: 60 })}
                    disabled={loading || !target.trim()}
                  >
                    {loading ? "Scanning..." : "Service Scan"}
                  </button>
                )}
                {liveStream && (
                  <button
                    onClick={() => startStream(target, topPorts)}
                    disabled={streaming || !target.trim()}
                    className={streaming ? "loading" : ""}
                    aria-label="Start live port scanning"
                  >
                    {streaming ? "Scanning..." : "Live Scan"}
                  </button>
                )}
              </div>
            )}

            {activeTab === "curl" && (
              <div className="controls" role="group" aria-label="HTTP tester tools">
                <select 
                  value={curlMethod} 
                  onChange={(e) => setCurlMethod(e.target.value)}
                  className="method-select"
                  aria-label="HTTP method"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                  <option>HEAD</option>
                  <option>PATCH</option>
                </select>
                <input
                  placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                  value={curlHeaders}
                  onChange={(e) => setCurlHeaders(e.target.value)}
                  className="target"
                  style={{ flex: 1 }}
                  aria-label="HTTP headers in JSON format"
                />
                <button
                  onClick={() => {
                    let headers = {};
                    try {
                      headers = curlHeaders ? JSON.parse(curlHeaders) : {};
                    } catch (e) {
                      setOutput("Invalid headers JSON");
                      return;
                    }
                    const url = target.includes("://") ? target : `${protocol}://${target}`;
                    postJSON("/api/http", { url, method: curlMethod, timeout: 15, verbose: true, headers });
                  }}
                  disabled={loading || !target.trim()}
                  aria-label="Send HTTP request like curl or Postman"
                >
                  {loading ? "Sending..." : "Send Request"}
                </button>
              </div>
            )}
          </section>

          <section className="card results" style={{ marginTop: 24 }} aria-labelledby="results-heading">
            <h2 id="results-heading" className="visually-hidden">Results</h2>
            
            {/* Aesthetic Status Display for Quick Check */}
            {activeTab === "isitdown" && (status || loading) ? (
              <div className="status-container">
                {loading ? (
                  <div className="status-loading">
                    <div className="pulse-ring"></div>
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Checking {checkType}...</div>
                  </div>
                ) : status === 'up' ? (
                  <div className="status-up animate-fadeIn">
                    <div className="status-icon success">
                      <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                        <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                      </svg>
                    </div>
                    <div className="status-content">
                      <h3 className="status-title">✓ {output.type === 'website' ? 'Website is UP' : 'Port is OPEN'}</h3>
                      <div className="status-details">
                        <div className="status-metric">
                          <span className="metric-label">Response Time:</span>
                          <span className="metric-value">{responseTime}ms</span>
                        </div>
                        {output.statusCode && (
                          <div className="status-metric">
                            <span className="metric-label">Status Code:</span>
                            <span className="metric-value status-code">{output.statusCode}</span>
                          </div>
                        )}
                        {output.latency && (
                          <div className="status-metric">
                            <span className="metric-label">Latency:</span>
                            <span className="metric-value">{output.latency}ms</span>
                          </div>
                        )}
                        <div className="status-note">{output.details}</div>
                      </div>
                    </div>
                  </div>
                ) : status === 'down' ? (
                  <div className="status-down animate-fadeIn">
                    <div className="status-icon error">
                      <svg className="xmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                        <circle className="xmark-circle" cx="26" cy="26" r="25" fill="none"/>
                        <path className="xmark-path" fill="none" d="M16 16l20 20 M36 16l-20 20"/>
                      </svg>
                    </div>
                    <div className="status-content">
                      <h3 className="status-title">✗ {output.type === 'website' ? 'Website is DOWN' : 'Port is CLOSED'}</h3>
                      <div className="status-details">
                        <div className="status-metric">
                          <span className="metric-label">Response Time:</span>
                          <span className="metric-value">{responseTime}ms</span>
                        </div>
                        {output.statusCode && (
                          <div className="status-metric">
                            <span className="metric-label">Status Code:</span>
                            <span className="metric-value status-code">{output.statusCode}</span>
                          </div>
                        )}
                        <div className="status-note">{output.details}</div>
                        {output.error && (
                          <div className="status-error">
                            <small>Error: {output.error}</small>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : activeTab === "scanner" && liveStream ? (
              <div className="port-list">
                {streamPorts.length > 0 ? (
                  streamPorts.map((p) => (
                    <div key={`${p.port}/${p.proto}`} className="port-item">
                      <div className="port-badge">
                        <span className={`dot ${p.state.toLowerCase()}`} />
                        <strong>{p.port}</strong>
                        <small>/{p.proto}</small>
                      </div>
                      <div className="port-meta">
                        <div className="service-name">
                          <span className="badge-abbr">{serviceIcon(p.service)}</span>
                          {p.service}
                        </div>
                        <div className="service-state">{p.state.toUpperCase()}</div>
                      </div>
                    </div>
                  ))
                ) : streaming ? (
                  <div style={{ color: "var(--muted)", textAlign: "center", padding: "40px" }}>
                    <div style={{ marginBottom: "16px" }}>Scanning ports...</div>
                    <div className="loading" style={{ 
                      height: "4px", 
                      width: "200px", 
                      margin: "0 auto",
                      borderRadius: "2px" 
                    }}></div>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", textAlign: "center", padding: "40px" }}>
                    Click "Live Scan" to start scanning
                  </div>
                )}
              </div>
            ) : loading ? (
              <div style={{ color: "var(--muted)", textAlign: "center", padding: "40px" }}>
                <div style={{ marginBottom: "16px" }}>Processing request...</div>
                <div className="loading" style={{ 
                  height: "4px", 
                  width: "200px", 
                  margin: "0 auto",
                  borderRadius: "2px" 
                }}></div>
              </div>
            ) : typeof output === "string" ? (
              <pre>{output}</pre>
            ) : output && output.nmapPorts ? (
              <div className="port-list">
                {output.nmapPorts.length > 0 ? (
                  output.nmapPorts.map((p) => (
                    <div key={`${p.port}/${p.proto}`} className="port-item">
                      <div className="port-badge">
                        <span className="dot open" />
                        <strong>{p.port}</strong>
                        <small>/{p.proto}</small>
                      </div>
                      <div className="port-meta">
                        <div className="service-name">
                          <span className="badge-abbr">{serviceIcon(p.service)}</span>
                          {p.service}
                        </div>
                        <div className="service-state">{p.state.toUpperCase()}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--muted)", textAlign: "center", padding: "20px" }}>
                    No open ports found in the scan
                  </div>
                )}
              </div>
            ) : (
              <pre>{JSON.stringify(output, null, 2)}</pre>
            )}
          </section>
        </div>

        <aside>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Quick Tips</h3>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              Use full URLs for HTTP (https://). Service scans are TCP connect only.
            </p>
          </section>
        </aside>
      </main>

    
      <section className="popular-services">
  <h3>Popular Services Quick Check</h3>
  <div className="services-grid">
    {/* Row 1 */}
    <ServiceCard name="Instagram" protocol="https" domain="instagram.com" />
    <ServiceCard name="YouTube" protocol="https" domain="youtube.com" />
    <ServiceCard name="X (Twitter)" protocol="https" domain="twitter.com" />
    
    {/* Row 2 */}
    <ServiceCard name="Jio" protocol="https" domain="jio.com" />
    <ServiceCard name="Airtel" protocol="https" domain="airtel.in" />
    <ServiceCard name="VI Vodafone Idea" protocol="https" domain="myvi.in" />
    
    {/* Row 3 */}
    <ServiceCard name="SBI" protocol="https" domain="onlinesbi.sbi" />
    <ServiceCard name="UPI" protocol="https" domain="upi.org.in" />
    <ServiceCard name="OpenAI" protocol="https" domain="openai.com" />
  </div>
</section>

      <footer className="footer">Built by Abraham</footer>
    </div>
  );
}