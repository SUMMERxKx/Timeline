/* ============================================================================
   YOUR PATH THROUGH TRU — APP.JS (Fully Annotated)
   ----------------------------------------------------------------------------
   What this script does:
   - Builds a horizontally-scrollable academic timeline (Summer → Fall → Winter)
   - Lets users click a card to add/edit notes (saved in browser localStorage)
   - Exports a .txt plan and prints a clean PDF view (separate “print view” DOM)
   - Stays responsive: JS reads CSS variables so math matches the layout

   Mental model:
   - STATE is the source of truth (scroll position, which terms exist, etc.)
   - RENDER builds UI from state (cards grid + year ruler)
   - INTERACTIONS mutate state (drag, arrows, edit notes) → then sync the DOM
   ========================================================================== */


/* ====== config (fixed app constants) =======================================
   ORDER: academic “lanes” from top→bottom; also the cycle order across years
   TERMS_PER_YEAR: used for math (absolute index; ruler widths)
   ROW_TOP: maps term → which row (0=Summer, 1=Fall, 2=Winter) to place the card
============================================================================= */
const ORDER = ["Summer", "Fall", "Winter"];
const TERMS_PER_YEAR = 3;
const ROW_TOP = { "Summer": 0, "Fall": 1, "Winter": 2 };


/* ====== elements (cache DOM nodes for quick access) ========================
   We query important elements once and reuse the references everywhere.
   This avoids repeated document lookups and clarifies the UI structure.
============================================================================= */
// Form + inputs
const form = document.getElementById("builder");
const startTermEl = document.getElementById("startTerm");
const startYearEl = document.getElementById("startYear");
const gradYearEl = document.getElementById("gradYear");

// Timeline viewport and content strips
const viewport = document.getElementById("viewport");
const content = document.getElementById("content");
const yearsTrack = document.getElementById("yearsTrack");

// Navigation + controls
const navLeft = document.getElementById("navLeft");
const navRight = document.getElementById("navRight");
const clearNotesBtn = document.getElementById("clearNotes");

// Editor modal elements
const modal = document.getElementById("editor");
const modalBackdrop = document.getElementById("modalBackdrop");
const editTitle = document.getElementById("editTitle");
const editTextarea = document.getElementById("editTextarea");
const saveNoteBtn = document.getElementById("saveNote");
const cancelNoteBtn = document.getElementById("cancelNote");

// Export/Print controls + print view targets
const exportTxtBtn = document.getElementById("exportTxt");
const printPdfBtn = document.getElementById("printPdf");
const printView = document.getElementById("printView");
const printMeta = document.getElementById("printMeta");
const printTable = document.getElementById("printTable");


/* ====== state (mutable; changes as user interacts) =========================
   SCROLL: x is the single source of truth for horizontal offset (px).
   DRAGGING: flags/values to compute delta from pointer movement.
   EDITING: which note is being edited (storage key + preview node to update).
   METRICS: numbers mirroring CSS variables (kept in sync via readMetrics()).
   TERMS: the data model (array of { term, year }) that drives rendering.
   SCROLL DISTANCE: step the arrows move; tuned per device width.
============================================================================= */
let x = 0,                  // current horizontal scroll translate (px)
    dragging = false,       // is a drag gesture in progress?
    startX = 0,             // pointer X where drag started
    startTranslate = 0;     // x value at drag start (baseline for relative move)

let currentKey = null,      // storage key for currently edited card (e.g., "Fall-2027-3")
    currentCard = null;     // the specific .preview <div> to update live after save

let metrics = {             // layout numbers; defaulted, then synced from CSS
  w: 220,   // card width
  gap: 14,  // horizontal gap between cards
  h: 110,   // card height
  gapY: 10  // vertical gap between rows
};

let currentTerms = [];      // array of { term, year } defining which cards exist
let scrollDistance = 400;   // how far the ◀ ▶ buttons move per click (px)


/* ====== helpers (tiny utilities used everywhere) ===========================
   termIndex(t):    "Fall" → 1   (based on ORDER)
   absIndex(t, y):  global sequential index across all years (y*3 + termIndex)
   px(n):           number → "Npx" (CSS expects units as strings)
============================================================================= */
/** Return position of term within ORDER (0,1,2). */
function termIndex(t) { return ORDER.indexOf(t); }

/** Map a {term,year} to a single linear index across all years. */
function absIndex(t, y) { return (y * TERMS_PER_YEAR + termIndex(t)); }

/** Convert a number to a CSS pixel string (e.g., 220 → "220px"). */
function px(n) { return n + "px"; }


/* ====== responsiveness (sync JS with CSS breakpoints) =====================
   updateScrollDistance(): pick a comfortable jump size for arrows per device.
   readMetrics():           read CSS custom properties so JS math matches UI.
============================================================================= */
/** Choose arrow-click jump distance by screen width (smaller on phones). */
function updateScrollDistance() {
  const screenWidth = window.innerWidth;
  if (screenWidth <= 480)      scrollDistance = 200; // phone: gentle, precise
  else if (screenWidth <= 768) scrollDistance = 300; // tablet: medium
  else                         scrollDistance = 400; // desktop: larger stride
}

/**
 * Pull current CSS layout numbers from :root (CSS variables).
 * WHY: CSS shrinks cards/gaps on smaller screens. JS must use the same values
 * when computing positions; otherwise cards would misalign.
 * Also refresh scrollDistance so arrows feel right on this device.
 */
function readMetrics(){
  const r = getComputedStyle(document.documentElement);
  metrics.w    = parseFloat(r.getPropertyValue("--card-w"))  || 220;
  metrics.gap  = parseFloat(r.getPropertyValue("--gap-x"))   || 14;
  metrics.h    = parseFloat(r.getPropertyValue("--card-h"))  || 110;
  metrics.gapY = parseFloat(r.getPropertyValue("--gap-y"))   || 10;

  updateScrollDistance();
}


/* ====== data builder (which cards should exist?) ===========================
   buildTerms(): from Start Term/Year to Grad Year (inclusive), push terms in
   the fixed cycle Summer→Fall→Winter. When we wrap back to Summer, increment
   the year (academic sequence).
============================================================================= */
/**
 * Build a linear list of {term, year} from user inputs.
 * @param {string} startTerm - "Summer" | "Fall" | "Winter"
 * @param {number} startYear
 * @param {number} gradYear
 * @returns {Array<{term:string, year:number}>}
 */
function buildTerms(startTerm, startYear, gradYear){
  const items = [];
  let t = startTerm;       // moving "cursor" for term
  let y = Number(startYear);

  // Loop until the next appended slot would exceed the grad year.
  // Example flow (start=Fall 2026, grad=2027):
  //  1) Fall 2026
  //  2) Winter 2026
  //  3) Summer 2027 (wrap → increment year)
  //  4) Fall 2027
  //  5) Winter 2027
  while (y <= gradYear){
    items.push({ term: t, year: y });

    // advance to the next term in the cycle (0→1→2→0...)
    const nextIdx = (termIndex(t) + 1) % TERMS_PER_YEAR;
    t = ORDER[nextIdx];

    // if we wrapped back to Summer, we've passed Winter → next academic year
    if (t === "Summer"){ y += 1; }
  }
  return items;
}


/* ====== scrolling engine (horizontal) =====================================
   applyX(): the single place that moves the timeline strip + year ruler.
   - clamps x within bounds (so no empty space shows)
   - applies translateX(x) to both strips
   - toggles ◀ ▶ buttons enabled/disabled at edges
============================================================================= */
/** Apply current horizontal offset x to the DOM, with clamping + UI updates. */
function applyX(){
  const totalWidth = content.scrollWidth;         // full width of cards strip
  const vpWidth = viewport.clientWidth;           // visible viewport width

  // The left-most we can translate so the right edge is exactly visible.
  // If totalWidth <= vpWidth, min becomes 0 (no scrolling needed).
  const min = Math.min(0, vpWidth - totalWidth);

  // Clamp x within [min, 0]
  if (x > 0)   x = 0;
  if (x < min) x = min;

  // Move both the cards content and the ruler in sync
  content.style.transform    = `translateX(${x}px)`;
  yearsTrack.style.transform = `translateX(${x}px)`;

  // Update arrow button states: disabled at edges
  navLeft.disabled  = (x === 0);
  navRight.disabled = (x === min);
}


/* ====== storage helpers ====================================================
   getNote(key): fetch a saved note (or "" if none) from localStorage.
   Keys are generated per card as `${term}-${year}-${i}` inside render().
============================================================================= */
/** Read a note from browser storage (or return empty string if not present). */
function getNote(key){
  return localStorage.getItem(key) || "";
}


/* ====== render (build the on-screen timeline UI) ===========================
   This is the heart of the UI:
   1) Sync with CSS (readMetrics)
   2) Build data model (buildTerms)
   3) Compute layout (step, total width)
   4) Create + position cards; wire click → open editor modal
   5) Create a year ruler aligned under the cards
   6) Reset scroll and apply (applyX)
============================================================================= */
/**
 * Build/refresh the timeline UI from inputs.
 * @param {string} startTerm
 * @param {number} startYear
 * @param {number} gradYear
 */
function render(startTerm, startYear, gradYear){
  // A) Sync JS math with CSS sizing & choose arrow jump size for this device
  readMetrics();

  // B) Build the linear list of displayed slots (drives DOM creation)
  currentTerms = buildTerms(startTerm, Number(startYear), Number(gradYear));

  // C) Layout distances
  const step = metrics.w + metrics.gap;  // horizontal stride per card (width + gap)
  const startAbs = absIndex(startTerm, Number(startYear));
  // Total strip width = (#cards * stride) - trailing gap (no gap after last card)
  const totalWidth = currentTerms.length * step - metrics.gap;

  // D) Prep the content strip container
  content.innerHTML = "";                                    // remove old cards
  content.style.width  = px(Math.max(totalWidth, 0));
  // Height fits three rows = (card-h * 3) + (gap-y * 2), defined in CSS calc
  content.style.height = `calc( (var(--card-h) * 3) + (var(--gap-y) * 2) )`;

  // E) Create each card at its absolute position, wire click handler
  currentTerms.forEach((item, i) => {
    const {term, year} = item;

    // Create the outer card element
    const card = document.createElement("div");
    card.className = "term";

    // Unique storage key for this card's note (term-year-index)
    // NOTE: index i ensures uniqueness even if terms repeat across multiple years.
    const key = `${term}-${year}-${i}`;
    card.dataset.key = key;

    // Positioning:
    //  - left: horizontal index * stride
    //  - top: lane row * (card height + vertical gap)
    card.style.left = px(i * step);
    card.style.top  = px(ROW_TOP[term] * (metrics.h + metrics.gapY));

    // Header label "Term Year"
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = `${term} ${year}`;

    // Preview shows first line of the saved note or a friendly placeholder
    const preview = document.createElement("div");
    preview.className = "preview";
    const saved = getNote(key);
    // Split by newline (supports \n and \r\n), take first line, or fallback text
    preview.textContent = (saved.split(/\r?\n/)[0] || "Click to add notes");

    // Clicking a card opens the note editor modal for this specific card
    card.addEventListener("click", (e) => {
      e.stopPropagation();              // don't trigger viewport drag
      currentCard = preview;            // cache the exact preview node to update
      currentKey  = key;                // cache the storage key used on save
      editTitle.textContent = `${term} ${year}`;  // modal title
      editTextarea.value    = getNote(key);       // load fresh note text
      modal.classList.remove("hidden");           // show modal
      editTextarea.focus();                       // UX: focus for typing
      document.body.style.overflow = 'hidden';    // prevent background scroll
    });

    // Assemble and append into the content strip
    card.append(label, preview);
    content.appendChild(card);
  });

  // F) Build year ruler: one label per calendar year, positioned to span 3 cards
  yearsTrack.innerHTML = "";
  yearsTrack.style.width = px(Math.max(totalWidth, 0));

  for(let y = Number(startYear); y <= Number(gradYear); y++){
    // Position where that year's Summer aligns relative to the timeline start
    const idxFromStart = absIndex("Summer", y) - startAbs;  // (could be negative)
    const left = idxFromStart * step;

    // Width across Summer+Fall+Winter = 3 card widths + 2 gaps
    const width = (TERMS_PER_YEAR * metrics.w) + ((TERMS_PER_YEAR - 1) * metrics.gap);

    const yEl = document.createElement("div");
    yEl.className = "yearLabel";
    yEl.style.left = px(left);
    yEl.style.width = px(width);
    yEl.textContent = String(y);
    yearsTrack.appendChild(yEl);
  }

  // G) Reset horizontal view to the start and apply clamped transform to DOM
  x = 0;
  applyX();
}


/* ====== export/print data builders ========================================
   groupByYear(): normalize currentTerms + notes into a year→[{term,year,text}]
   buildTxt():    produce a human-readable .txt plan (metadata + grouped notes)
   refreshPrintView(): construct the print-only DOM (hidden until printing)
============================================================================= */
/** Group visible terms + their notes into a Map keyed by year (sorted). */
function groupByYear(){
  const map = new Map();

  // Walk the currently rendered slots and collect notes by year.
  currentTerms.forEach((t, i) => {
    const key = t.year;
    const storageKey = `${t.term}-${t.year}-${i}`;
    const text = getNote(storageKey).trim();

    if(!map.has(key)) map.set(key, []);
    map.get(key).push({ term: t.term, year: t.year, text });
  });

  // For each year, order Summer→Fall→Winter consistently
  for(const [y, arr] of map){
    arr.sort((a,b) => ORDER.indexOf(a.term) - ORDER.indexOf(b.term));
  }

  // Finally, return a new Map sorted by ascending year
  return new Map([...map.entries()].sort((a,b) => a[0]-b[0]));
}


/** Build the plain-text export content for download as .txt. */
function buildTxt(){
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear  = Number(gradYearEl.value);

  const lines = [];

  // Header
  lines.push("=".repeat(60));
  lines.push("           YOUR PATH THROUGH TRU — ACADEMIC PLAN");
  lines.push("=".repeat(60));
  lines.push("");

  // Metadata (friendly + timestamped)
  lines.push("PLAN DETAILS:");
  lines.push(`  Start Term:     ${startTerm} ${startYear}`);
  lines.push(`  Expected Graduation: ${gradYear}`);
  lines.push(`  Total Duration: ${gradYear - startYear + 1} year(s)`);
  lines.push(`  Generated:      ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`);
  lines.push("");

  // Body: by year → by term (with placeholders for empty notes)
  const grouped = groupByYear();
  for(const [year, items] of grouped){
    lines.push("-".repeat(50));
    lines.push(`ACADEMIC YEAR ${year}`);
    lines.push("-".repeat(50));

    items.forEach(({term, text}) => {
      const cleanText = (text || "").trim();
      lines.push("");
      lines.push(`${term.toUpperCase()} ${year}:`);
      if (cleanText) {
        // Keep original line breaks, indent nicely
        const formatted = cleanText
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .join('\n');
        lines.push(`  ${formatted.replace(/\n/g, '\n  ')}`);
      } else {
        lines.push("  [No notes added yet]");
      }
    });
    lines.push("");
  }

  // Footer
  lines.push("=".repeat(60));
  lines.push("Generated by TRU Timeline Planner");
  lines.push("Thompson Rivers University");
  lines.push("=".repeat(60));

  return lines.join("\n");
}


/** Rebuild the hidden print view DOM from current data (used right before print). */
function refreshPrintView(){
  printTable.innerHTML = "";
  const grouped = groupByYear();

  // Update metadata summary (top of print)
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear  = Number(gradYearEl.value);
  const duration  = gradYear - startYear + 1;

  printMeta.innerHTML = `
    <strong>Plan Details:</strong><br>
    Start Term: ${startTerm} ${startYear} • Expected Graduation: ${gradYear} • Duration: ${duration} year(s)<br>
    Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
  `;

  // For each year, create a header and rows for its terms
  for(const [year, items] of grouped){
    // Year section header (styled via CSS for print)
    const yearHeader = document.createElement("div");
    yearHeader.className = "print-year-header";
    yearHeader.innerHTML = `
      <div class="year-title">Academic Year ${year}</div>
      <div class="year-divider"></div>
    `;
    printTable.appendChild(yearHeader);

    // Term rows: left = label, right = full multi-line text (or placeholder)
    items.forEach(({term, text}) => {
      const row = document.createElement("div");
      row.className = "print-row";

      const t = document.createElement("div");
      t.className = "term-label";
      t.textContent = `${term} ${year}`;

      const txt = document.createElement("div");
      txt.className = "text-content";
      if (text && text.trim()) {
        const formatted = text
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .join('\n');
        txt.textContent = formatted;
      } else {
        txt.innerHTML = '<em>No notes added yet</em>';
      }

      row.append(t, txt);
      printTable.appendChild(row);
    });

    // Spacer between year sections
    const spacer = document.createElement("div");
    spacer.className = "year-spacer";
    printTable.appendChild(spacer);
  }
}


/* ====== events: form + buttons + gestures + modals =========================
   This is where user actions hook into the logic above.
============================================================================= */

// Form submit → validate inputs → rebuild timeline
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear  = Number(gradYearEl.value);

  // Basic guardrail: grad must be >= start
  if(!startYear || !gradYear || gradYear < startYear){
    alert("Please enter valid years. Grad year must be the same as or after the start year.");
    return;
  }
  render(startTerm, startYear, gradYear);
});

// "Clear notes" button → show confirm modal (actual deletion occurs on confirm)
clearNotesBtn.addEventListener("click", () => {
  const confirmModal = document.getElementById("confirmClear");
  confirmModal.classList.remove("hidden");
});

// Arrow navigation (coarse horizontal moves)
navLeft.addEventListener("click",  () => { x += scrollDistance; applyX(); });
navRight.addEventListener("click", () => { x -= scrollDistance; applyX(); });


// === Mouse dragging (desktop) ===
// Start drag only if clicking empty viewport (not on a .term card).
viewport.addEventListener("mousedown", (e) => {
  if(e.target.closest(".term")) return;
  dragging = true;
  startX = e.clientX;         // pointer position at drag start
  startTranslate = x;         // remember starting x
  viewport.style.cursor = "grabbing";
  e.preventDefault();         // avoid text selection while dragging
});

window.addEventListener("mousemove", (e) => {
  if(!dragging) return;
  // delta = current pointer X - start pointer X (positive=right, negative=left)
  x = startTranslate + (e.clientX - startX);
  applyX();
});

window.addEventListener("mouseup", () => {
  dragging = false;
  viewport.style.cursor = "default";
});


// === Touch dragging (mobile/tablet) ===
// Use passive listeners for smoother scrolling; never call preventDefault here.
viewport.addEventListener("touchstart", (e) => {
  if(e.target.closest(".term")) return; // taps on cards should open editor instead
  dragging = true;
  startX = e.touches[0].clientX;  // finger X at touch start
  startTranslate = x;             // remember starting x
},{passive:true});

viewport.addEventListener("touchmove", (e) => {
  if(!dragging) return;
  x = startTranslate + (e.touches[0].clientX - startX);  // follow finger
  applyX();
},{passive:true});

viewport.addEventListener("touchend", () => { dragging = false; });


// === Editor modal controls ===
modalBackdrop.addEventListener("click", () => {
  modal.classList.add("hidden");
  document.body.style.overflow = ''; // re-enable page scroll
});

cancelNoteBtn.addEventListener("click", () => {
  modal.classList.add("hidden");
  document.body.style.overflow = ''; // re-enable page scroll
});

saveNoteBtn.addEventListener("click", () => {
  if(!currentKey) return; // safety: no active card

  // 1) Get cleaned text (remove trailing whitespace/newlines)
  const text = (editTextarea.value || "").trimEnd();

  // 2) Persist to browser storage under this card's unique key
  //    (try/catch optional here if you want to handle quota errors)
  localStorage.setItem(currentKey, text);

  // 3) Update the small preview (first line or placeholder)
  if(currentCard){
    currentCard.textContent = text.split(/\r?\n/)[0] || "Click to add notes";
  }

  // 4) Close modal + restore body scroll
  modal.classList.add("hidden");
  document.body.style.overflow = '';

  // 5) Optional hidden surprise (first card + phrase)
  checkEasterEgg(text);
});


// === Confirm-clear modal controls ===
const confirmModal = document.getElementById("confirmClear");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const cancelClearBtn = document.getElementById("cancelClear");
const confirmClearBtn = document.getElementById("confirmClearBtn");

// Clicking backdrop/cancel closes confirm dialog without deleting notes
confirmBackdrop.addEventListener("click", () => confirmModal.classList.add("hidden"));
cancelClearBtn.addEventListener("click", () => confirmModal.classList.add("hidden"));

// Confirm deletion: remove all term notes from localStorage and reset previews
confirmClearBtn.addEventListener("click", () => {
  // Remove only keys that match our "Term-YYYY-Index" pattern
  Object.keys(localStorage).forEach(k => {
    if(/^(Summer|Fall|Winter)-\d{4}-\d+$/.test(k)){
      localStorage.removeItem(k);
    }
  });

  // Reset on-screen previews immediately (no full re-render needed)
  document.querySelectorAll(".term .preview").forEach(p => {
    p.textContent = "Click to add notes";
  });

  confirmModal.classList.add("hidden");
});


// === Easter egg modal ===
const easterEggModal = document.getElementById("easterEgg");
const easterEggBackdrop = document.getElementById("easterEggBackdrop");
const closeEasterEggBtn = document.getElementById("closeEasterEgg");

easterEggBackdrop.addEventListener("click", () => easterEggModal.classList.add("hidden"));
closeEasterEggBtn.addEventListener("click", () => easterEggModal.classList.add("hidden"));

/**
 * Secret: if the FIRST card's note contains "who is samar", show a fun modal.
 * Uses currentKey.endsWith('-0') to detect the first generated card.
 */
function checkEasterEgg(text) {
  if (currentKey && currentKey.endsWith('-0') && text.toLowerCase().includes('who is samar')) {
    const easterEggModal = document.getElementById("easterEgg");
    easterEggModal.classList.remove("hidden");
  }
}


// === Keyboard shortcuts ===
// - Escape: close editor modal / confirm modal / easter egg modal (if open)
// - Ctrl/Cmd + Enter: save note from editor modal
window.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && !modal.classList.contains("hidden")) {
    modal.classList.add("hidden");
    document.body.style.overflow = '';
  }
  if(e.key === "Enter" && (e.ctrlKey || e.metaKey) && !modal.classList.contains("hidden")){
    saveNoteBtn.click();
  }
  if(e.key === "Escape" && !confirmModal.classList.contains("hidden")){
    confirmModal.classList.add("hidden");
  }
  const egg = document.getElementById("easterEgg");
  if(e.key === "Escape" && egg && !egg.classList.contains("hidden")){
    egg.classList.add("hidden");
  }
});


// === Export .txt ===
// Build text; create a Blob; trigger a download with a temporary <a> element.
exportTxtBtn.addEventListener("click", () => {
  const txt = buildTxt();
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "TRU_Timeline.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});


// === Print / Save as PDF ===
// Build print-only DOM fresh, then open the browser print dialog.
printPdfBtn.addEventListener("click", () => {
  refreshPrintView();
  window.print(); // choose "Save as PDF" in the print dialog to export a PDF
});


// === Window resize ===
// Re-read CSS sizes and re-apply clamped x to keep the view valid/responsive.
window.addEventListener("resize", () => {
  readMetrics();
  applyX();
});


/* ====== initialization (on page load) ======================================
   Set friendly defaults; compute scroll distance; render initial timeline.
============================================================================= */
startTermEl.value = "Summer";
startYearEl.value = new Date().getFullYear();
gradYearEl.value  = new Date().getFullYear() + 2;

// Initialize device-based jump size and build the initial timeline UI
updateScrollDistance();
render(startTermEl.value, Number(startYearEl.value), Number(gradYearEl.value));
