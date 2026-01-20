import React from "react";

export default function Nav({ active = "isitdown", onChange }) {
  const items = [
    { id: "home", label: "Home" },
    { id: "isitdown", label: "Isitdown" },
    { id: "scanner", label: "Service scanner" },
    { id: "curl", label: "curl" },
  ];

  return (
    <nav className="nav" aria-label="Main navigation">
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              className={`nav-item ${active === it.id ? "active" : ""}`}
              onClick={() => onChange && onChange(it.id)}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
