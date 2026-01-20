import React, { useState } from "react";
import Nav from "./components/Nav";

export default function App() {
  const [output, setOutput] = useState("Results will appear here...");
  const [target, setTarget] = useState("");
  const [verbose, setVerbose] = useState(false);
  const [activeTab, setActiveTab] = useState("isitdown");
  const [curlMethod, setCurlMethod] = useState("GET");
  const [curlHeaders, setCurlHeaders] = useState("");
  const [topPorts, setTopPorts] = useState(100);


  async function postJSON(path, body) {
    setOutput("Running...");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setOutput(JSON.stringify(data, null, 2));
    } catch (e) {
      setOutput("Request failed: " + e);
    }
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
            <input
              className="target"
              placeholder="https://example.com or example.com:80"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />

            {activeTab === "isitdown" && (
              <div className="controls">
                <button onClick={() => postJSON("/api/http", { url: target, timeout: 10, verbose })}>
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
                <button onClick={() => postJSON("/api/nmap", { host: target, top_ports: topPorts, timeout: 60 })}>
                  Service scan
                </button>
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
                    postJSON("/api/http", { url: target, method: curlMethod, timeout: 15, verbose: true, headers });
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </section>

          <section className="card results" style={{ marginTop: 18 }}>
            <pre>{output}</pre>
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
