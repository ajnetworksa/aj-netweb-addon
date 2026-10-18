// Who may see a menu item or gets kiosk mode. A rule is one of:
//   "all" | true          everyone
//   "admins"              HA administrators
//   "non_admins"          everyone who is not an administrator
//   "none" | false        nobody
//   ["Mama", "panel-majlis", "admins"]   HA user names (display name, not login) or user ids;
//                                         "admins" / "non_admins" may be mixed in
// A comma-separated string ("Mama, Ahmed") works like a list.
export function allowed(rule, hass, fallback = "all") {
  const r = rule === undefined || rule === null || rule === "" ? fallback : rule;
  const u = (hass && hass.user) || {};
  const one = (x) => {
    const v = String(x).trim().toLowerCase();
    if (v === "all" || v === "everyone" || v === "true") return true;
    if (v === "none" || v === "nobody" || v === "false") return false;
    if (v === "admins") return !!u.is_admin;
    if (v === "non_admins") return !u.is_admin;
    return v !== "" && (v === String(u.name || "").trim().toLowerCase() || v === String(u.id || "").toLowerCase());
  };
  if (r === true) return true;
  if (r === false) return false;
  const list = Array.isArray(r) ? r : String(r).split(",");
  return list.some(one);
}
