import React from "react";

export default function Nav({ active = "isitdown", onChange }) {
  const items = [
    { id: "isitdown", label: "Quick Check" },
    { id: "scanner", label: "Service Scanner" },
    { id: "curl", label: "Advanced HTTP" },
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
              aria-current={active === it.id ? "page" : undefined}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}