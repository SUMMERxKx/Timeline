/* ====== config ====== */
/* Application configuration constants */
const ORDER = ["Summer", "Fall", "Winter"];  // Academic year order - calendar year runs Summer..Winter
const TERMS_PER_YEAR = 3; // Number of terms in an academic year
const ROW_TOP = { "Summer": 0, "Fall": 1, "Winter": 2 }; // Vertical position mapping for timeline lanes (0..2)

/* ====== elements ====== */
/* DOM element references for form inputs */
const form = document.getElementById("builder");
const startTermEl = document.getElementById("startTerm");
const startYearEl = document.getElementById("startYear");
const gradYearEl = document.getElementById("gradYear");

/* DOM element references for timeline viewport and content */
const viewport = document.getElementById("viewport");
const content = document.getElementById("content");
const yearsTrack = document.getElementById("yearsTrack");

/* DOM element references for navigation and controls */
const navLeft = document.getElementById("navLeft");
const navRight = document.getElementById("navRight");
const clearNotesBtn = document.getElementById("clearNotes");

/* DOM element references for modal dialog */
const modal = document.getElementById("editor");
const modalBackdrop = document.getElementById("modalBackdrop");
const editTitle = document.getElementById("editTitle");
const editTextarea = document.getElementById("editTextarea");
const saveNoteBtn = document.getElementById("saveNote");
const cancelNoteBtn = document.getElementById("cancelNote");

/* Export buttons + print view DOM references */
const exportTxtBtn = document.getElementById("exportTxt");
const printPdfBtn = document.getElementById("printPdf");
const printView = document.getElementById("printView");
const printMeta = document.getElementById("printMeta");
const printTable = document.getElementById("printTable");

/* ====== state ====== */
/* Timeline scrolling state variables */
let x = 0, // Current horizontal scroll position
    dragging = false, // Whether user is currently dragging the timeline
    startX = 0, // Starting X position when drag begins
    startTranslate = 0; // Starting translate position when drag begins

/* Modal editing state variables */
let currentKey = null, // Storage key for the currently edited note
    currentCard = null; // DOM element reference to the currently edited card

/* Layout metrics for responsive design */
let metrics = { w: 220, gap: 14, h: 110, gapY: 10 }; // Card width, gap, height, vertical gap
let currentTerms = []; // Array to keep track of visible terms for export functionality

/* ====== helpers ====== */
/* Utility function to get the index of a term in the ORDER array */
const termIndex = t => ORDER.indexOf(t);

/* Calculate absolute index of a term across all years (for positioning calculations) */
const absIndex = (t, y) => (y * TERMS_PER_YEAR + termIndex(t));

/* Utility function to convert numbers to pixel strings */
const px = n => `${n}px`;

/**
 * Read current CSS custom properties to update layout metrics
 * This ensures the JavaScript calculations match the current CSS values
 */
function readMetrics(){
  const r = getComputedStyle(document.documentElement);
  metrics.w = parseFloat(r.getPropertyValue("--card-w")) || 220;
  metrics.gap = parseFloat(r.getPropertyValue("--gap-x")) || 14;
  metrics.h = parseFloat(r.getPropertyValue("--card-h")) || 110;
  metrics.gapY = parseFloat(r.getPropertyValue("--gap-y")) || 10;
}

/**
 * Build an array of all terms from start to graduation
 * @param {string} startTerm - Starting academic term (Summer/Fall/Winter)
 * @param {number} startYear - Starting academic year
 * @param {number} gradYear - Expected graduation year
 * @returns {Array} Array of term objects with term and year properties
 */
function buildTerms(startTerm, startYear, gradYear){
  const items = [];
  let t = startTerm;
  let y = Number(startYear);

  // Generate terms until we reach or exceed the graduation year
  while (y <= gradYear){
    items.push({ term: t, year: y });
    // Advance to next term
    const nextIdx = (termIndex(t) + 1) % TERMS_PER_YEAR;
    t = ORDER[nextIdx];
    // Increment year when we cycle back to Summer
    if (t === "Summer"){ y += 1; }
  }
  return items;
}

/**
 * Apply current scroll position to timeline elements
 * Handles boundary constraints and updates navigation button states
 */
function applyX(){
  const totalWidth = content.scrollWidth;
  const vpWidth = viewport.clientWidth;
  const min = Math.min(0, vpWidth - totalWidth);

  // Constrain scroll position to valid bounds
  if (x > 0) x = 0;
  if (x < min) x = min;

  // Apply transform to move content and year ruler
  content.style.transform = `translateX(${x}px)`;
  yearsTrack.style.transform = `translateX(${x}px)`;

  // Update navigation button states based on scroll position
  navLeft.disabled = (x === 0);
  navRight.disabled = (x === min);
}

/**
 * Retrieve a note from localStorage
 * @param {string} key - Storage key for the note
 * @returns {string} The stored note text or empty string if not found
 */
function getNote(key){
  return localStorage.getItem(key) || "";
}

/* ====== render ====== */
/**
 * Main rendering function that creates the timeline visualization
 * @param {string} startTerm - Starting academic term
 * @param {number} startYear - Starting academic year
 * @param {number} gradYear - Expected graduation year
 */
function render(startTerm, startYear, gradYear){
  // Update metrics to match current CSS values
  readMetrics();

  // Build the complete list of terms for the timeline
  currentTerms = buildTerms(startTerm, Number(startYear), Number(gradYear));
  const step = metrics.w + metrics.gap; // Distance between cards
  const startAbs = absIndex(startTerm, Number(startYear)); // Absolute index of first term
  const totalWidth = currentTerms.length * step - metrics.gap; // Total timeline width

  /* place cards */
  // Clear existing content and set container dimensions
  content.innerHTML = "";
  content.style.width = px(Math.max(totalWidth, 0));
  content.style.height = `calc( (var(--card-h) * 3) + (var(--gap-y) * 2) )`;

  // Create and position each timeline card
  currentTerms.forEach((item, i) => {
    const {term, year} = item;
    const card = document.createElement("div");
    card.className = "term";
    const key = `${term}-${year}-${i}`; // Unique storage key for this term
    card.dataset.key = key;

    // Position card horizontally and vertically
    card.style.left = px(i * step);
    card.style.top  = px(ROW_TOP[term] * (metrics.h + metrics.gapY));

    // Create card header with term and year
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = `${term} ${year}`;

    // Create card content area with note preview
    const preview = document.createElement("div");
    preview.className = "preview";
    const saved = getNote(key);
    // Show first line of note or default text
    preview.textContent = (saved.split(/\r?\n/)[0] || "Click to add notes");

    // Add click handler to open note editor
    card.addEventListener("click", (e) => {
      e.stopPropagation();
      currentCard = preview;
      currentKey = key;
      editTitle.textContent = `${term} ${year}`;
      // Get the current note from localStorage (not the cached value)
      editTextarea.value = getNote(key);
      modal.classList.remove("hidden");
      editTextarea.focus();
    });

    // Assemble and add card to timeline
    card.append(label, preview);
    content.appendChild(card);
  });

  /* year ruler */
  // Clear and set up year ruler at bottom of timeline
  yearsTrack.innerHTML = "";
  yearsTrack.style.width = px(Math.max(totalWidth, 0));

  // Create year labels for each academic year
  for(let y = Number(startYear); y <= Number(gradYear); y++){
    const idxFromStart = absIndex("Summer", y) - startAbs; // Position relative to timeline start
    const left = idxFromStart * step;
    const width = (TERMS_PER_YEAR * metrics.w) + ((TERMS_PER_YEAR - 1) * metrics.gap);

    const yEl = document.createElement("div");
    yEl.className = "yearLabel";
    yEl.style.left = px(left);
    yEl.style.width = px(width);
    yEl.textContent = String(y);
    yearsTrack.appendChild(yEl);
  }

  // Reset scroll position and apply constraints
  x = 0;
  applyX();
}

/* ====== build export text & print view ====== */
/**
 * Group timeline terms by year for export and print formatting
 * @returns {Map} Map of year to array of term objects with notes
 */
function groupByYear(){
  const map = new Map();
  currentTerms.forEach((t, i) => {
    const key = t.year;
    const storageKey = `${t.term}-${t.year}-${i}`;
    const text = getNote(storageKey).trim();
    if(!map.has(key)) map.set(key, []);
    map.get(key).push({ term: t.term, year: t.year, text });
  });
  // Sort each year's terms by the standard order (Summer, Fall, Winter)
  for(const [y, arr] of map){
    arr.sort((a,b) => ORDER.indexOf(a.term) - ORDER.indexOf(b.term));
  }
  // Return sorted map by year
  return new Map([...map.entries()].sort((a,b) => a[0]-b[0]));
}

/**
 * Build plain text export of the timeline
 * @returns {string} Formatted text representation of the timeline
 */
function buildTxt(){
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear = Number(gradYearEl.value);

  const lines = [];
  
  // Header with TRU branding
  lines.push("=".repeat(60));
  lines.push("           YOUR PATH THROUGH TRU — ACADEMIC PLAN");
  lines.push("=".repeat(60));
  lines.push("");
  
  // Metadata section
  lines.push("PLAN DETAILS:");
  lines.push(`  Start Term:     ${startTerm} ${startYear}`);
  lines.push(`  Expected Graduation: ${gradYear}`);
  lines.push(`  Total Duration: ${gradYear - startYear + 1} year(s)`);
  lines.push(`  Generated:      ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`);
  lines.push("");
  
  // Timeline content grouped by year
  const grouped = groupByYear();
  let hasContent = false;
  
  for(const [year, items] of grouped){
    // Check if this year has any content
    const yearHasContent = items.some(item => item.text.trim());
    if (yearHasContent) hasContent = true;
    
    lines.push("-".repeat(50));
    lines.push(`ACADEMIC YEAR ${year}`);
    lines.push("-".repeat(50));
    
    items.forEach(({term, text}) => {
      const cleanText = text.trim();
      lines.push("");
      lines.push(`${term.toUpperCase()} ${year}:`);
      if (cleanText) {
        // Format the text with proper indentation and line breaks
        const formattedText = cleanText
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
        lines.push(`  ${formattedText.replace(/\n/g, '\n  ')}`);
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

/**
 * Update the hidden print view with current timeline data
 * This creates a clean, formatted layout for PDF generation
 */
function refreshPrintView(){
  printTable.innerHTML = "";
  const grouped = groupByYear();

  // Update print metadata with enhanced formatting
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear = Number(gradYearEl.value);
  const duration = gradYear - startYear + 1;
  printMeta.innerHTML = `
    <strong>Plan Details:</strong><br>
    Start Term: ${startTerm} ${startYear} • Expected Graduation: ${gradYear} • Duration: ${duration} year(s)<br>
    Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
  `;

  // Build print table with timeline data
  for(const [year, items] of grouped){
    // Create year header with enhanced styling
    const yearHeader = document.createElement("div");
    yearHeader.className = "print-year-header";
    yearHeader.innerHTML = `
      <div class="year-title">Academic Year ${year}</div>
      <div class="year-divider"></div>
    `;
    printTable.appendChild(yearHeader);

    // Create rows for each term in the year
    items.forEach(({term, text}) => {
      const row = document.createElement("div");
      row.className = "print-row";
      
      // Term label with enhanced styling
      const t = document.createElement("div");
      t.className = "term-label";
      t.textContent = `${term} ${year}`;

      // Note content with better formatting
      const txt = document.createElement("div");
      txt.className = "text-content";
      if (text && text.trim()) {
        // Format the text with proper line breaks and spacing
        const formattedText = text
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');
        txt.textContent = formattedText;
      } else {
        txt.innerHTML = '<em>No notes added yet</em>';
      }

      row.append(t, txt);
      printTable.appendChild(row);
    });
    
    // Add spacing between years
    const spacer = document.createElement("div");
    spacer.className = "year-spacer";
    printTable.appendChild(spacer);
  }
}

/* ====== events ====== */
/* Form submission handler for timeline generation */
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const startTerm = startTermEl.value;
  const startYear = Number(startYearEl.value);
  const gradYear = Number(gradYearEl.value);
  
  // Validate input values
  if(!startYear || !gradYear || gradYear < startYear){
    alert("Please enter valid years. Grad year must be the same as or after the start year.");
    return;
  }
  render(startTerm, startYear, gradYear);
});

/* Clear all saved notes button handler */
clearNotesBtn.addEventListener("click", () => {
  // Show the confirmation modal instead of browser alert
  const confirmModal = document.getElementById("confirmClear");
  confirmModal.classList.remove("hidden");
});

/* Navigation arrow handlers */
navLeft.addEventListener("click", () => { x += 400; applyX(); });
navRight.addEventListener("click", () => { x -= 400; applyX(); });

/* Mouse dragging functionality for timeline scrolling */
viewport.addEventListener("mousedown", (e) => {
  if(e.target.closest(".term")) return; // Don't start drag if clicking on a card
  dragging = true; startX = e.clientX; startTranslate = x;
  viewport.style.cursor = "grabbing"; e.preventDefault();
});
window.addEventListener("mousemove", (e) => {
  if(!dragging) return; 
  x = startTranslate + (e.clientX - startX); 
  applyX();
});
window.addEventListener("mouseup", () => { 
  dragging = false; 
  viewport.style.cursor = "default"; 
});

/* Touch dragging functionality for mobile devices */
viewport.addEventListener("touchstart", (e) => {
  if(e.target.closest(".term")) return; // Don't start drag if touching a card
  dragging = true; startX = e.touches[0].clientX; startTranslate = x;
},{passive:true});
viewport.addEventListener("touchmove", (e) => {
  if(!dragging) return; 
  x = startTranslate + (e.touches[0].clientX - startX); 
  applyX();
},{passive:true});
viewport.addEventListener("touchend", () => { dragging = false; });

/* Modal dialog event handlers */
modalBackdrop.addEventListener("click", () => modal.classList.add("hidden"));
cancelNoteBtn.addEventListener("click", () => modal.classList.add("hidden"));
saveNoteBtn.addEventListener("click", () => {
  if(!currentKey) return;
  const text = (editTextarea.value || "").trimEnd();
  localStorage.setItem(currentKey, text);
  if(currentCard){ 
    currentCard.textContent = text.split(/\r?\n/)[0] || "Click to add notes"; 
  }
  modal.classList.add("hidden");
  
  // Check for easter egg trigger in the first container
  checkEasterEgg(text);
});

/* Confirmation modal event handlers */
const confirmModal = document.getElementById("confirmClear");
const confirmBackdrop = document.getElementById("confirmBackdrop");
const cancelClearBtn = document.getElementById("cancelClear");
const confirmClearBtn = document.getElementById("confirmClearBtn");

confirmBackdrop.addEventListener("click", () => confirmModal.classList.add("hidden"));
cancelClearBtn.addEventListener("click", () => confirmModal.classList.add("hidden"));
confirmClearBtn.addEventListener("click", () => {
  // Remove all timeline-related items from localStorage
  Object.keys(localStorage).forEach(k => {
    if(/^(Summer|Fall|Winter)-\d{4}-\d+$/.test(k)){ localStorage.removeItem(k); }
  });
  // Reset all card previews to default text
  document.querySelectorAll(".term .preview").forEach(p => p.textContent = "Click to add notes");
  // Close the modal
  confirmModal.classList.add("hidden");
});

/* Easter egg modal event handlers */
const easterEggModal = document.getElementById("easterEgg");
const easterEggBackdrop = document.getElementById("easterEggBackdrop");
const closeEasterEggBtn = document.getElementById("closeEasterEgg");

easterEggBackdrop.addEventListener("click", () => easterEggModal.classList.add("hidden"));
closeEasterEggBtn.addEventListener("click", () => easterEggModal.classList.add("hidden"));

/* Easter egg functionality */
function checkEasterEgg(text) {
  // Check if this is the first container and contains the easter egg trigger
  if (currentKey && currentKey.endsWith('-0') && text.toLowerCase().includes('who is samar')) {
    // Show the easter egg modal
    const easterEggModal = document.getElementById("easterEgg");
    easterEggModal.classList.remove("hidden");
    
    // Add some fun sound effects (optional - browser may block autoplay)
    try {
      // Create a simple beep sound
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Silently fail if audio is blocked
    }
  }
}

/* Keyboard shortcuts for modal */
window.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  if(e.key === "Enter" && (e.ctrlKey || e.metaKey) && !modal.classList.contains("hidden")) saveNoteBtn.click();
  // Handle confirmation modal keyboard shortcuts
  if(e.key === "Escape" && !confirmModal.classList.contains("hidden")) confirmModal.classList.add("hidden");
  // Handle easter egg modal keyboard shortcuts
  if(e.key === "Escape" && !document.getElementById("easterEgg").classList.contains("hidden")) {
    document.getElementById("easterEgg").classList.add("hidden");
  }
});

/* Export functionality */
/* Download timeline as plain text file */
exportTxtBtn.addEventListener("click", () => {
  const txt = buildTxt();
  const blob = new Blob([txt], {type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "TRU_Timeline.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* Print/Save as PDF functionality */
printPdfBtn.addEventListener("click", () => {
  // Build a clean print view and invoke the browser's print dialog.
  refreshPrintView();
  window.print(); // Choose "Save as PDF" to create a .pdf file
});

/* ====== initialization ====== */
/* Set default values and render initial timeline */
startTermEl.value = "Summer";
startYearEl.value = new Date().getFullYear();
gradYearEl.value = new Date().getFullYear() + 2;
render(startTermEl.value, Number(startYearEl.value), Number(gradYearEl.value));
