// Stand-ins for HA's <ha-icon> and <ha-card> so cards render outside Home Assistant (preview only).
import * as mdi from "@mdi/js";

const camel = (n) => "mdi" + n.replace("mdi:", "").split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : "")).join("");
customElements.define("ha-icon", class extends HTMLElement {
  static get observedAttributes() { return ["icon"]; }
  connectedCallback() { this.r(); }
  attributeChangedCallback() { this.r(); }
  r() {
    const p = mdi[camel(this.getAttribute("icon") || "")] || "";
    this.innerHTML = `<svg viewBox="0 0 24 24" style="width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px);fill:currentColor;display:block"><path d="${p}"/></svg>`;
    this.style.display = "inline-flex";
  }
});
customElements.define("ha-card", class extends HTMLElement { connectedCallback() { this.style.display = "block"; } });
