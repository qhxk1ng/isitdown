import React, { useState, useEffect, useRef } from "react";
import Nav from "./components/Nav";

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

  async function postJSON(path, body) {
    setLoading(true);
    setStatus(null);
    setCheckType(path === "/api/http" ? "website" : "port");
    setResponseTime(null);
    setOutput("Checking...");
    
    const startTime = performance.now();
    
    try {
      const res = await fetch(path, {
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

  function ServiceCard({ name, protocol, domain }) {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
  
    const checkService = async () => {
      setLoading(true);
      setStatus(null);
      
      try {
        const res = await fetch("/api/http", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            url: `${protocol}://${domain}`, 
            timeout: 10, 
            verbose: false 
          }),
        });
        
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status_code >= 200 && data.status_code < 400 ? 'up' : 'down');
        } else {
          setStatus('down');
        }
      } catch (e) {
        setStatus('down');
      } finally {
        setLoading(false);
      }
    };
  
    return (
      <div className={`service-card ${status}`} onClick={checkService}>
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
        </div>
        <button 
          className="service-check-btn" 
          onClick={(e) => {
            e.stopPropagation();
            checkService();
          }}
          disabled={loading}
          aria-label={`Check ${name} status`}
        >
          {loading ? 'Checking...' : 'Check'}
        </button>
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
    {/* Social Media */}
    <ServiceCard name="Instagram" protocol="https" domain="instagram.com" />
    <ServiceCard name="YouTube" protocol="https" domain="youtube.com" />
    <ServiceCard name="X (Twitter)" protocol="https" domain="twitter.com" />
    
    {/* Telecom */}
    <ServiceCard name="Jio" protocol="https" domain="jio.com" />
    <ServiceCard name="Airtel" protocol="https" domain="airtel.in" />
    <ServiceCard name="VI Vodafone Idea" protocol="https" domain="myvi.in" />
    
    {/* Banking & Finance */}
    <ServiceCard name="SBI" protocol="https" domain="onlinesbi.sbi" />
    <ServiceCard name="UPI" protocol="https" domain="upi.org.in" />
    
    {/* AI & Tech */}
    <ServiceCard name="OpenAI" protocol="https" domain="openai.com" />
  </div>
</section>

      <footer className="footer">Built by Abraham</footer>
    </div>
  );
}