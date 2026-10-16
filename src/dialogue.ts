import { NPC_DIALOGUES } from './dialogue-content';
import { announce } from './a11y';

/**
 * Dialogue system — uses NPC_DIALOGUES content (bilingual stories).
 * Page-based: backstory → Q&A → letter preview → delivery.
 */

let open = false;
/** Pages of text to show. */
let pages: string[] = [];
/** Current page index. */
let pageIdx = 0;
/** Optional delivery trigger (wired by main.ts). */
let deliverHandler: (() => void) | null = null;
/** Optional accept-letter trigger (wired by main.ts). */
let acceptHandler: (() => void) | null = null;

export function setDeliverHandler(cb: (() => void) | null): void {
  deliverHandler = cb;
  const btn = document.getElementById('dialogue-deliver') as HTMLButtonElement | null;
  if (btn) btn.style.display = cb ? '' : 'none';
}

export function setAcceptHandler(cb: (() => void) | null): void {
  acceptHandler = cb;
  const btn = document.getElementById('dialogue-accept') as HTMLButtonElement | null;
  if (btn) btn.style.display = cb ? '' : 'none';
}

let panel: HTMLDivElement | null = null;
let nameEl: HTMLDivElement | null = null;
let textEl: HTMLDivElement | null = null;

function ensurePanel(): void {
  if (panel) return;

  const style = document.createElement('style');
  style.textContent = `
#dialogue {
  position: fixed;
  left: 50%;
  bottom: 18px;
  transform: translate(-50%, 12px) rotate(-0.5deg);
  width: min(620px, calc(100vw - 32px));
  max-height: 45vh;
  overflow-y: auto;
  z-index: 30;
  background: #fffdf6;
  border: 3px solid #2b2b2b;
  border-radius: 18px;
  padding: 14px 18px 12px;
  color: #2b2b2b;
  font-family: "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive;
  box-shadow: 5px 5px 0 rgba(43, 43, 43, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
  cursor: pointer;
}
#dialogue.open {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0) rotate(-0.5deg);
}
#dialogue-name {
  display: inline-block;
  font-weight: 900;
  color: #fffdf6;
  background: #2e8f86;
  border: 2px solid #2b2b2b;
  border-radius: 10px;
  padding: 2px 12px;
  margin-bottom: 8px;
  font-size: 15px;
  letter-spacing: 0.03em;
  transform: rotate(-1deg);
}
#dialogue-text {
  min-height: 44px;
  line-height: 1.5;
  font-size: 16px;
  white-space: pre-wrap;
}
#dialogue-hint {
  text-align: right;
  font-size: 12px;
  opacity: 0.55;
  margin-top: 6px;
}
#dialogue-deliver {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
  border: 3px solid #2b2b2b;
  border-radius: 12px;
  background: #f2b93b;
  color: #2b2b2b;
  font-family: inherit;
  font-size: 17px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 3px 3px 0 #2b2b2b;
}
#dialogue-accept {
  display: block;
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
  border: 3px solid #2b2b2b;
  border-radius: 12px;
  background: #7fb069;
  color: #2b2b2b;
  font-family: inherit;
  font-size: 17px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 3px 3px 0 #2b2b2b;
}
#dialogue-close {
  position: absolute;
  top: 6px;
  right: 10px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  color: #fdf6e3;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
#dialogue-close:hover {
  background: rgba(255,255,255,0.25);
}`;
  document.head.appendChild(style);

  panel = document.createElement('div');
  panel.id = 'dialogue';
  nameEl = document.createElement('div');
  nameEl.id = 'dialogue-name';
  textEl = document.createElement('div');
  textEl.id = 'dialogue-text';
  const hint = document.createElement('div');
  hint.id = 'dialogue-hint';
  hint.textContent = 'E / Space / tap to continue · Esc to say goodbye';
  const closeBtn = document.createElement('button');
  closeBtn.id = 'dialogue-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close dialogue');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setDeliverHandler(null);
    setAcceptHandler(null);
    closeDialogue();
  });
  const deliverBtn = document.createElement('button');
  deliverBtn.id = 'dialogue-deliver';
  deliverBtn.textContent = '📮 Deliver letter';
  deliverBtn.style.display = 'none';
  deliverBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (deliverHandler) {
      const cb = deliverHandler;
      closeDialogue();
      cb();
    }
  });
  const acceptBtn = document.createElement('button');
  acceptBtn.id = 'dialogue-accept';
  acceptBtn.textContent = '✉️ Accept letter';
  acceptBtn.style.display = 'none';
  acceptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (acceptHandler) {
      const cb = acceptHandler;
      closeDialogue();
      cb();
    }
  });
  panel.append(nameEl, textEl, deliverBtn, acceptBtn, hint, closeBtn);
  panel.addEventListener('click', () => showNext());
  document.body.appendChild(panel);
}

export function closeDialogue(): void {
  open = false;
  pages = [];
  pageIdx = 0;
  if (panel) panel.classList.remove('open');
}

function showNext(): void {
  if (!open || !panel || !textEl) return;
  if (pageIdx < pages.length) {
    const line = pages[pageIdx++];
    textEl.textContent = line;
    announce(`${nameEl?.textContent ?? 'Someone'}: ${line}`);
    return;
  }
  closeDialogue();
}

// Advance on E or Space while a dialogue is open (registered once).
window.addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'e' || e.key === 'E' || e.key === ' ') {
    e.preventDefault();
    showNext();
  }
});

export function startDialogue(npc: {
  id: string;
  name: string;
  nameHi: string;
  line: string;
  lineHi: string;
}): void {
  ensurePanel();
  pages = [];
  pageIdx = 0;
  
  const content = NPC_DIALOGUES[npc.id];
  if (content) {
    // Backstory
    pages.push(content.backstory.en);
    // Q&A
    for (const qa of content.questions) {
      pages.push(`Q: ${qa.q.en}\n\nA: ${qa.a.en}`);
    }
    // Letter preview
    pages.push(
      `📮 Letter: ${content.letter.subject.en}\n` +
      `From: ${content.letter.from.en}\n` +
      `To: ${content.letter.to.en}\n\n` +
      `${content.letter.body.en}`
    );
  } else {
    // Fallback to signature lines
    pages = [npc.line, npc.lineHi].filter((l) => l.length > 0);
  }
  
  if (nameEl) nameEl.textContent = npc.name;
  open = true;
  if (panel) panel.classList.add('open');
  showNext();
}

export function isDialogueOpen(): boolean {
  return open;
}
