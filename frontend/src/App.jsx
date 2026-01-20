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
  const esRef = useRef(null);

  // clear output and stop any streaming when changing tabs
  useEffect(() => {
    setOutput("Results will appear here...");
    setStreamPorts([]);
    setStreamBuffer("");
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (e) {}
      esRef.current = null;
    }
    setStreaming(false);
  }, [activeTab]);


  async function postJSON(path, body) {
    setOutput("Running...");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      // If nmap-style output present, parse and show styled port list
      if (data && typeof data.stdout === "string" && data.stdout.includes("PORT")) {
        const ports = parseNmap(data.stdout);
        setOutput({ nmapPorts: ports });
      } else {
        setOutput(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setOutput("Request failed: " + e);
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
      // expected format: "21/tcp   open  ftp"
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
    // return an uppercase short label (no emojis) for consistency and clean UI
    if (!name) return "UNK";
    const n = String(name).toUpperCase();
    // common abbreviations
    const map = {
      FTP: "FTP",
      SSH: "SSH",
      HTTP: "HTTP",
      HTTPS: "HTTPS",
      SMTP: "SMTP",
      DOMAIN: "DNS",
      IMAP: "IMAP",
      POP3: "POP3",
    };
    return map[n] || n.slice(0, 4);
  }

  function startStream(host, ports) {
    if (!host) {
      setOutput("enter host");
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
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        return;
      }
      if (d.startsWith("__ERROR__")) {
        setOutput(d);
        setStreaming(false);
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }
        return;
      }
      // append to buffer and parse
      setStreamBuffer((prev) => {
        const next = prev + "\n" + d;
        const portsParsed = parseNmap(next);
        setStreamPorts(portsParsed);
        return next;
      });
    };
    es.onerror = (err) => {
      setOutput("stream error");
      setStreaming(false);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-inner">
          <h1 className="brand">isitdown.space</h1>
          <Nav active={activeTab} onChange={setActiveTab} />
          <p className="tag">Quick checks for websites, servers and services</p>
        </div>
      </header>

      <main className="container">
        <div>
          <section className="card">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                className="protocol-select"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                aria-label="Protocol"
              >
                <option value="http">http</option>
                <option value="https">https</option>
              </select>
              <input
                className="target"
                placeholder="example.com or example.com:80"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>

            {activeTab === "isitdown" && (
              <div className="controls">
                <button onClick={() => {
                  const url = target.includes("://") ? target : `${protocol}://${target}`;
                  postJSON("/api/http", { url, timeout: 10, verbose });
                }}>
                  HTTP
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
                >
                  Port
                </button>
                <label className="chk">
                  <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
                  Verbose
                </label>
              </div>
            )}

            {activeTab === "scanner" && (
              <div className="controls">
                <label className="chk">
                  Top ports:
                  <input
                    type="number"
                    value={topPorts}
                    onChange={(e) => setTopPorts(Number(e.target.value || 100))}
                    style={{ width: 96, marginLeft: 8, padding: 6, borderRadius: 8 }}
                  />
                </label>
                <label className="chk">
                  Live:
                  <input
                    type="checkbox"
                    checked={liveStream}
                    onChange={(e) => setLiveStream(e.target.checked)}
                    style={{ marginLeft: 8 }}
                  />
                </label>
                {!liveStream && (
                  <button onClick={() => postJSON("/api/nmap", { host: target, top_ports: topPorts, timeout: 60 })}>
                    Service scan
                  </button>
                )}
                {liveStream && (
                  <button
                    onClick={() => {
                      startStream(target, topPorts);
                    }}
                    disabled={streaming}
                  >
                    {streaming ? "Scanning…" : "Live Scan"}
                  </button>
                )}
              </div>
            )}

            {activeTab === "curl" && (
              <div className="controls">
                <select value={curlMethod} onChange={(e) => setCurlMethod(e.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                </select>
                <input
                  placeholder="Headers (JSON)"
                  value={curlHeaders}
                  onChange={(e) => setCurlHeaders(e.target.value)}
                  style={{ marginLeft: 8, padding: 8, borderRadius: 8, width: 260 }}
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
                >
                  Send
                </button>
              </div>
            )}
          </section>

        <section className="card results" style={{ marginTop: 18 }}>
            {activeTab === "scanner" && liveStream ? (
              <div className="port-list">
                {streamPorts.map((p) => (
                  <div key={`${p.port}/${p.proto}`} className="port-item">
                    <div className="port-badge">
                      <span className={`dot ${p.state}`} />
                      <strong>{p.port}</strong>
                      <small>/{p.proto}</small>
                    </div>
                    <div className="port-meta">
                      <div className="service-name">
                        <span className="badge-abbr">{serviceIcon(p.service)}</span>
                        {p.service}
                      </div>
                      <div className="service-state">{p.state}</div>
                    </div>
                  </div>
                ))}
                {streaming && streamPorts.length === 0 && <div style={{ color: "var(--muted)" }}>Waiting for results…</div>}
              </div>
            ) : typeof output === "string" ? (
              <pre>{output}</pre>
            ) : output && output.nmapPorts ? (
              <div className="port-list">
                {output.nmapPorts.map((p) => (
                  <div key={`${p.port}/${p.proto}`} className="port-item">
                    <div className="port-badge">
                      <span className="dot open" />
                      <strong>{p.port}</strong>
                      <small>/{p.proto}</small>
                    </div>
                    <div className="port-meta">
                      <div className="service-name"><span className="badge-abbr">{serviceIcon(p.service)}</span>{p.service}</div>
                      <div className="service-state">{p.state}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <pre>{JSON.stringify(output, null, 2)}</pre>
            )}
          </section>
        </div>

        <aside>
          <section className="card">
            <h3 style={{ marginTop: 0 }}>Quick tips</h3>
            <p style={{ color: "var(--muted)", marginBottom: 0 }}>
              Use full URLs for HTTP (https://). Service scans are TCP connect only.
            </p>
          </section>
        </aside>
      </main>

      <footer className="footer">Built with FastAPI · No auth · Limited scans</footer>
    </div>
  );
}
