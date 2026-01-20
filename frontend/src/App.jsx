import React, { useState } from "react";
import Nav from "./components/Nav";

export default function App() {
  const [output, setOutput] = useState("Results will appear here...");
  const [target, setTarget] = useState("");
  const [verbose, setVerbose] = useState(false);

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
          <Nav />
          <p className="tag">Quick checks for websites, servers and services</p>
        </div>
      </header>

      <main className="container">
        <section className="card">
          <input
            className="target"
            placeholder="https://example.com or example.com:80"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
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
            <button onClick={() => postJSON("/api/nmap", { host: target, top_ports: 100, timeout: 30 })}>
              Service scan
            </button>
            <label className="chk">
              <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
              Verbose
            </label>
          </div>
        </section>

        <section className="card results">
          <pre>{output}</pre>
        </section>
      </main>

      <footer className="footer">Built with FastAPI · No auth · Limited scans</footer>
    </div>
  );
}
