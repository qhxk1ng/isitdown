import React, { useState, useEffect, useRef } from "react";
import Nav from "./components/Nav";

export default function App() {
  const [output, setOutput] = useState("Results will appear here...");
  const [target, setTarget] = useState("");
  const [verbose, setVerbose] = useState(false);
  const [activeTab, setActiveTab] = useState("isitdown");
  const [curlMethod, setCurlMethod] = useState("GET");
  const [curlHeaders, setCurlHeaders] = useState("");
  const [topPorts, setTopPorts] = useState(100);
  const [protocol, setProtocol] = useState("https");
  const [liveStream, setLiveStream] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamPorts, setStreamPorts] = useState([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [loading, setLoading] = useState(false);
  const esRef = useRef(null);

  // Clear output and stop any streaming when changing tabs
  useEffect(() => {
    setOutput("Results will appear here...");
    setStreamPorts([]);
    setStreamBuffer("");
    setLoading(false);
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (e) {}
      esRef.current = null;
    }
    setStreaming(false);
  }, [activeTab]);

  async function postJSON(path, body) {
    setLoading(true);
    setOutput("Running...");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      
      // If nmap-style output present, parse and show styled port list
      if (data && typeof data.stdout === "string" && data.stdout.includes("PORT")) {
        const ports = parseNmap(data.stdout);
        setOutput({ nmapPorts: ports });
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setOutput(`Error: ${e.message}`);
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
          <h1 className="brand">isitdown.space - Free Online Service Checker & Port Scanner</h1>
          <Nav active={activeTab} onChange={setActiveTab} />
          <p className="tag">Quick checks for websites, servers and services - No installation required</p>
        </div>
      </header>

      <main className="container">
        <div>
          <section className="card" aria-labelledby="main-controls">
            <h2 id="main-controls" className="visually-hidden">Service Check Controls</h2>
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
              <div className="controls" role="group" aria-label="Website checker tools">
                <button 
                  onClick={() => {
                    const url = target.includes("://") ? target : `${protocol}://${target}`;
                    postJSON("/api/http", { url, timeout: 10, verbose });
                  }}
                  disabled={loading || !target.trim()}
                  aria-label="Check if website is down"
                >
                  {loading ? "Testing..." : "Check Website"}
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
                  aria-label="Check port status"
                >
                  Check Port
                </button>
                <label className="chk">
                  <input 
                    type="checkbox" 
                    checked={verbose} 
                    onChange={(e) => setVerbose(e.target.checked)} 
                    aria-label="Enable verbose output"
                  />
                  Verbose Output
                </label>
              </div>
            )}

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
                    aria-label="Run online nmap port scan"
                  >
                    {loading ? "Scanning..." : "Run Nmap Scan"}
                  </button>
                )}
                {liveStream && (
                  <button
                    onClick={() => startStream(target, topPorts)}
                    disabled={streaming || !target.trim()}
                    className={streaming ? "loading" : ""}
                    aria-label="Start live port scanning"
                  >
                    {streaming ? "Scanning..." : "Live Port Scan"}
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
                  {loading ? "Sending..." : "Send HTTP Request"}
                </button>
              </div>
            )}
          </section>

          <section className="card results" style={{ marginTop: 24 }} aria-labelledby="results-heading">
            <h2 id="results-heading" className="visually-hidden">Results</h2>
            {activeTab === "scanner" && liveStream ? (
              <div className="port-list">
                {streamPorts.length > 0 ? (
                  streamPorts.map((p) => (
                    <div key={`${p.port}/${p.proto}`} className="port-item" itemScope itemType="https://schema.org/Service">
                      <div className="port-badge">
                        <span className={`dot ${p.state.toLowerCase()}`} aria-label={`Port ${p.state}`} />
                        <strong itemProp="serviceType">{p.port}</strong>
                        <small>/{p.proto}</small>
                      </div>
                      <div className="port-meta">
                        <div className="service-name">
                          <span className="badge-abbr">{serviceIcon(p.service)}</span>
                          <span itemProp="name">{p.service}</span>
                        </div>
                        <div className="service-state" itemProp="serviceStatus">{p.state.toUpperCase()}</div>
                      </div>
                    </div>
                  ))
                ) : streaming ? (
                  <div style={{ color: "var(--muted)", textAlign: "center", padding: "40px" }}>
                    <div style={{ marginBottom: "16px" }}>Scanning ports with online nmap tool...</div>
                    <div className="loading" style={{ 
                      height: "4px", 
                      width: "200px", 
                      margin: "0 auto",
                      borderRadius: "2px" 
                    }}></div>
                  </div>
                ) : (
                  <div style={{ color: "var(--muted)", textAlign: "center", padding: "40px" }}>
                    Click "Live Port Scan" to start scanning with our online nmap tool
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
                    <div key={`${p.port}/${p.proto}`} className="port-item" itemScope itemType="https://schema.org/Service">
                      <div className="port-badge">
                        <span className="dot open" aria-label="Port open" />
                        <strong itemProp="serviceType">{p.port}</strong>
                        <small>/{p.proto}</small>
                      </div>
                      <div className="port-meta">
                        <div className="service-name">
                          <span className="badge-abbr">{serviceIcon(p.service)}</span>
                          <span itemProp="name">{p.service}</span>
                        </div>
                        <div className="service-state" itemProp="serviceStatus">{p.state.toUpperCase()}</div>
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

        <aside aria-labelledby="seo-content">
          <section className="card">
            <h3 id="seo-content" style={{ marginTop: 0 }}>Free Online Tools for Developers & Sysadmins</h3>
            <div style={{ color: "var(--muted)", marginBottom: 0 }}>
              <p><strong>isitdown.space</strong> provides free online tools for checking website status, scanning ports, and testing HTTP requests. No installation required.</p>
              
              <h4 style={{ marginTop: "16px", marginBottom: "8px" }}>Featured Tools:</h4>
              <ul style={{ paddingLeft: "20px", marginBottom: "16px" }}>
                <li><strong>Website Status Checker</strong> - Check if any website is down or online</li>
                <li><strong>Port Scanner</strong> - Online nmap tool for scanning open ports</li>
                <li><strong>HTTP Tester</strong> - Curl-like interface for testing APIs and web services</li>
                <li><strong>Service Scanner</strong> - Detect running services on any server</li>
                <li><strong>Network Monitor</strong> - Real-time port scanning and service detection</li>
              </ul>
              
              <h4 style={{ marginTop: "16px", marginBottom: "8px" }}>Popular Use Cases:</h4>
              <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                <li>Check if your website is accessible worldwide</li>
                <li>Scan servers for open ports like 80, 443, 22, 21</li>
                <li>Test API endpoints with different HTTP methods</li>
                <li>Monitor service availability and uptime</li>
                <li>Debug network connectivity issues</li>
              </ul>
            </div>
          </section>
          
          <section className="card" style={{ marginTop: "16px" }}>
            <h4 style={{ marginTop: 0 }}>Compare With Similar Tools</h4>
            <p style={{ color: "var(--muted)", marginBottom: "12px", fontSize: "14px" }}>
              Unlike traditional tools that require installation, <strong>isitdown.space</strong> works directly in your browser:
            </p>
            <div style={{ fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Online Nmap Alternative:</span>
                <span style={{ color: "#10b981" }}>✓ Available</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Curl/Postman Online:</span>
                <span style={{ color: "#10b981" }}>✓ Available</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Service Checker:</span>
                <span style={{ color: "#10b981" }}>✓ Available</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Port Scanner:</span>
                <span style={{ color: "#10b981" }}>✓ Available</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Real-time Monitoring:</span>
                <span style={{ color: "#10b981" }}>✓ Available</span>
              </div>
            </div>
          </section>
          
          <section className="card" style={{ marginTop: "16px" }}>
            <h4 style={{ marginTop: 0 }}>SEO Keywords</h4>
            <div style={{ 
              display: "flex", 
              flexWrap: "wrap", 
              gap: "8px", 
              marginTop: "12px" 
            }}>
              {[
                "isitdown",
                "service checker",
                "port scanner",
                "online nmap",
                "online curl",
                "HTTP tester",
                "API tester",
                "website status",
                "server monitor",
                "network scanner",
                "port check",
                "online postman",
                "web service tester",
                "uptime checker",
                "service monitor"
              ].map((keyword, index) => (
                <span 
                  key={index}
                  style={{
                    padding: "6px 12px",
                    background: "rgba(59, 130, 246, 0.1)",
                    borderRadius: "20px",
                    fontSize: "12px",
                    color: "var(--accent-light)",
                    border: "1px solid rgba(59, 130, 246, 0.2)"
                  }}
                >
                  {keyword}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </main>

      <footer className="footer" role="contentinfo">
        <div style={{ maxWidth: "800px", margin: "0 auto", lineHeight: "1.6" }}>
          <p style={{ marginBottom: "8px" }}>
            <strong>isitdown.space</strong> - Free Online Service Checker, Port Scanner & HTTP Tester Tool
          </p>
          <p style={{ fontSize: "12px", color: "var(--muted-dark)", margin: 0 }}>
            This free online tool combines features of nmap, curl, and service monitoring in one web application. 
            Check website status, scan ports with our online nmap alternative, test APIs with curl-like interface. 
            Perfect for developers, sysadmins, and IT professionals. No registration required.
          </p>
        </div>
      </footer>
    </div>
  );
}