// The crate: one record per project. Flip through with swipe, wheel or the arrow keys; Enter turns the
// sleeve over to the liner notes. It is also the plain, accessible list of everything on the site.
import { ALL, OWNER } from "./data.js";

const ORDER = ["orbit", "quest", "ruckus", "line", "construct", "vision"];

export function makeCrate({ onClose, reduced }) {
  const root = document.getElementById("crate");
  const list = document.getElementById("records");
  const hint = document.getElementById("crate-hint");
  const items = ORDER.map((id) => ALL.find((d) => d.id === id));
  let cur = 0;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  list.innerHTML = items.map((d, i) => {
    const kicker = `No. ${i + 1}${d.parent ? " · Line framework" : ""}`;
    const front = d.preview
      ? `<div class="side front"><img src="${d.preview}" alt="" loading="lazy" decoding="async"><h3><small>${esc(kicker)}</small>${esc(d.name)}</h3></div>`
      : `<div class="side front type"><div class="blocks" aria-hidden="true">${"<i></i>".repeat(24)}</div><h3><small>${esc(kicker)}</small>${esc(d.name)}</h3></div>`;
    const links = d.links.map((l) => `<a href="${l.href}" target="_blank" rel="noopener">${esc(l.label === "Enter" ? "Live site" : l.label === "Status" ? "Status page" : l.label)}</a>`).join("");
    const label = d.preview ? `url(${d.preview}) center/cover` : "#123";
    return `<li class="rec" data-i="${i}" aria-label="${esc(d.name)}, record ${i + 1} of ${items.length}">
      <div class="disc" style="--label:${label}" aria-hidden="true"></div>
      <article class="sleeve">${front}
        <div class="side back">
          <h4>${esc(d.name)}</h4>
          <p>${esc(d.pitch)}</p>
          <p class="lbl">Side A</p>
          <ol>${d.facts.map((f) => `<li>${esc(f)}</li>`).join("")}</ol>
          <p class="lbl">Instruments</p><p>${d.tags.map(esc).join(" · ")}</p>
          ${d.note ? `<p class="lbl">Note</p><p>${esc(d.note)}</p>` : ""}
          <p class="lbl">Pressed by</p><p>${esc(OWNER.name)} · ${esc(OWNER.person)}</p>
          <p class="lbl">Play</p><p>${links}</p>
        </div>
      </article></li>`;
  }).join("");
  const recs = [...list.children];
  hint.textContent = matchMedia("(pointer: coarse)").matches ? "Swipe to flip · tap to turn the sleeve" : "Arrow keys or scroll to flip · Enter turns the sleeve";

  function render() {
    recs.forEach((el, i) => {
      const k = i - cur;
      let tf, op = 1, fl = "none";
      if (k === 0) { tf = "translate3d(0,-4%,40px) rotateX(0deg)"; }
      else if (k > 0) { tf = `translate3d(${k * 1.5}%,${-k * 6}%,${-k * 80}px) rotateX(-${10 + k * 3}deg) rotateZ(${(k % 2 ? 1 : -1) * 0.8}deg)`; fl = `brightness(${Math.max(0.22, 0.62 - k * 0.1)})`; op = k > 4 ? 0 : 1; }
      else { tf = `translate3d(0,${40 - k * 6}%,${120}px) rotateX(78deg)`; op = 0; }
      el.style.transform = tf; el.style.opacity = op; el.style.filter = fl; el.style.zIndex = String(100 - Math.abs(k) * 2 - (k < 0 ? 1 : 0));
      el.style.pointerEvents = k === 0 ? "auto" : "none";
      el.setAttribute("aria-current", k === 0 ? "true" : "false");
      if (k !== 0) el.classList.remove("turned");
    });
  }
  function go(i) { cur = Math.max(0, Math.min(recs.length - 1, i)); render(); }
  function turn() { recs[cur].classList.toggle("turned"); }

  list.addEventListener("click", (e) => { if (e.target.closest("a")) return; const li = e.target.closest(".rec"); if (li && +li.dataset.i === cur) turn(); });
  // keyboard focus on a link inside a record brings that record forward and turns it
  list.addEventListener("focusin", (e) => { const li = e.target.closest(".rec"); if (!li) return; const i = +li.dataset.i; if (i !== cur) go(i); if (e.target.tagName === "A") li.classList.add("turned"); });
  let sx = 0, sy = 0, down = false;
  list.addEventListener("pointerdown", (e) => { down = true; sx = e.clientX; sy = e.clientY; });
  list.addEventListener("pointerup", (e) => {
    if (!down) return; down = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1));
    else if (Math.abs(dy) > 40) go(cur + (dy < 0 ? 1 : -1));
  });
  let wheelT = 0;
  root.addEventListener("wheel", (e) => { e.preventDefault(); const now = performance.now(); if (now - wheelT < 450) return; wheelT = now; go(cur + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
  root.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { go(cur + 1); e.preventDefault(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { go(cur - 1); e.preventDefault(); }
    else if ((e.key === "Enter" || e.key === " ") && !e.target.closest("a")) { turn(); e.preventDefault(); }
  });
  document.getElementById("crate-back").addEventListener("click", (e) => { e.preventDefault(); onClose(); });
  root.addEventListener("click", (e) => { if (e.target === root) onClose(); });

  render();
  return {
    open(id) {
      if (id) { const i = ORDER.indexOf(id); if (i >= 0) cur = i; }
      root.hidden = false; render();
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
      root.tabIndex = -1; root.focus({ preventScroll: true });
    },
    close() { root.classList.remove("in"); setTimeout(() => { if (!root.classList.contains("in")) root.hidden = true; }, reduced ? 0 : 900); },
    get isOpen() { return !root.hidden; },
  };
}
