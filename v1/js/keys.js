// Keyboard helpers shared by v1 and v2 (each keeps its own copy): held-key axes, a "?" shortcut overlay,
// and a polite live region that announces what has focus.

export const isTyping = (e) => {
  const t = e.target;
  return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
};
const plain = (e) => !e.ctrlKey && !e.metaKey && !e.altKey;

const AXIS = {
  ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
  ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
  ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
};

export function makeKeys({ title, rows, enabled = () => true }) {
  const held = new Set();
  // ---- the overlay
  const box = document.createElement("div");
  box.id = "keys"; box.hidden = true;
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "keys-title");
  box.innerHTML = `<div class="keys-card"><h2 id="keys-title">${title}</h2><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <p class="keys-foot"><a href="#" id="keys-close">close</a> · Esc or ? to close</p></div>`;
  document.body.appendChild(box);
  let back = null;
  const setOverlay = (on) => {
    if (on === !box.hidden) return;
    box.hidden = !on; held.clear();
    if (on) { back = document.activeElement; box.querySelector("#keys-close").focus(); }
    else if (back && back.focus) back.focus({ preventScroll: true });
  };
  box.querySelector("#keys-close").addEventListener("click", (e) => { e.preventDefault(); setOverlay(false); });
  box.addEventListener("click", (e) => { if (e.target === box) setOverlay(false); });
  // ---- live region
  const live = document.createElement("p");
  live.id = "announce"; live.className = "sr-only"; live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
  document.body.appendChild(live);
  let lastSaid = "";
  const announce = (text) => {
    if (!text || text === lastSaid) return;
    lastSaid = text; live.textContent = ""; requestAnimationFrame(() => { live.textContent = text; });
    setTimeout(() => { if (lastSaid === text) lastSaid = ""; }, 1500);
  };

  // capture phase: runs before the pages' own handlers, so the overlay can swallow keys
  addEventListener("keydown", (e) => {
    if (isTyping(e)) return;
    if (e.key === "?" || (e.key === "/" && e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); setOverlay(box.hidden); return; }
    if (!box.hidden) {
      if (e.key === "Escape") { e.preventDefault(); setOverlay(false); }
      if (e.key === "Tab") { e.preventDefault(); box.querySelector("#keys-close").focus(); }
      e.stopImmediatePropagation(); return;
    }
    if (AXIS[e.key] && plain(e) && enabled(e)) held.add(e.key);
  }, true);
  addEventListener("keyup", (e) => { held.delete(e.key); held.delete(e.key.toLowerCase()); held.delete(e.key.toUpperCase()); }, true);
  addEventListener("blur", () => held.clear());

  return {
    held,
    axis() { // -1..1 on each axis from whatever is held
      let x = 0, y = 0;
      for (const k of held) { const a = AXIS[k]; if (a) { x += a[0]; y += a[1]; } }
      return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
    },
    isAxisKey: (e) => !!AXIS[e.key] && plain(e),
    announce,
    toggle: (on) => setOverlay(on ?? box.hidden),
    get overlayOpen() { return !box.hidden; },
  };
}

// Keep Tab inside a panel or dialog while it is open.
export function trapTab(container, e) {
  if (e.key !== "Tab") return false;
  const els = [...container.querySelectorAll("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])")]
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (!els.length) return false;
  const first = els[0], last = els[els.length - 1], cur = document.activeElement;
  if (e.shiftKey && (cur === first || !container.contains(cur) || cur === container)) { e.preventDefault(); last.focus(); return true; }
  if (!e.shiftKey && (cur === last || !container.contains(cur))) { e.preventDefault(); first.focus(); return true; }
  return false;
}
