import React from "react";

export default function Nav({ active = "isitdown", onChange }) {
  const items = [
    { id: "home", label: "Home", href: "/" },
    { id: "isitdown", label: "Status", href: "/status" },
    { id: "scanner", label: "Port Scanner", href: "/port-scan" },
    { id: "curl", label: "Curl", href: "/curl" },
  ];

  function navigate(e, it) {
    if (onChange) {
      e.preventDefault();
      window.history.pushState({}, "", it.href);
      onChange(it.id);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  return (
    <nav className="nav" aria-label="Main navigation">
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={it.href}
              className={`nav-item ${active === it.id ? "active" : ""}`}
              onClick={(e) => navigate(e, it)}
              aria-current={active === it.id ? "page" : undefined}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}