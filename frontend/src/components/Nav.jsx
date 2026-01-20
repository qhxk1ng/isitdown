import React from "react";

export default function Nav() {
  return (
    <nav className="nav">
      <ul>
        <li className="nav-item">Home</li>
        <li className="nav-item active">Isitdown</li>
        <li className="nav-item">Service scanner</li>
        <li className="nav-item">curl</li>
      </ul>
    </nav>
  );
}
