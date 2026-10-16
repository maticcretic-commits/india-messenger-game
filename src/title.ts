/**
 * Title screen — like the reference: the tiny planet fills the view,
 * hand-lettered title, chunky BEGIN button, floating doodles.
 * Resolves when the player taps BEGIN.
 */

let titleEl: HTMLDivElement | null = null;

function ensureStyles(): void {
  if (document.getElementById('title-styles')) return;
  const style = document.createElement('style');
  style.id = 'title-styles';
  style.textContent = `
#title-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  font-family: "Comic Sans MS", "Chalkboard SE", "Segoe Print", cursive;
}
#title-screen.hidden {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s ease;
}
#title-card {
  text-align: center;
  transform: rotate(-2deg);
}
#title-main {
  font-size: min(18vw, 110px);
  font-weight: 900;
  color: #fffdf6;
  letter-spacing: 0.04em;
  text-shadow:
    3px 3px 0 #2e8f86,
    6px 6px 0 rgba(46, 143, 134, 0.35);
  margin: 0;
  line-height: 1;
}
#title-sub {
  font-size: min(5vw, 22px);
  color: #fffdf6;
  opacity: 0.92;
  margin: 10px 0 0;
  text-shadow: 2px 2px 0 rgba(46, 143, 134, 0.6);
}
#title-begin {
  margin-top: 34px;
  font-family: inherit;
  font-size: min(7vw, 30px);
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #5a3a10;
  background: #f2b93b;
  border: 3px solid #5a3a10;
  border-radius: 16px;
  padding: 12px 54px;
  cursor: pointer;
  box-shadow: 4px 4px 0 #5a3a10;
  transform: rotate(1deg);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
#title-begin:hover {
  transform: rotate(1deg) scale(1.05);
}
#title-begin:active {
  transform: rotate(1deg) translate(2px, 2px);
  box-shadow: 2px 2px 0 #5a3a10;
}
#title-doodles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.doodle {
  position: absolute;
  font-size: 28px;
  opacity: 0.75;
  animation: doodle-float 7s ease-in-out infinite;
}
@keyframes doodle-float {
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-18px) rotate(8deg); }
}
`;
  document.head.appendChild(style);
}

/** Show the title screen; resolves on BEGIN. */
export function showTitle(): Promise<void> {
  ensureStyles();
  return new Promise((resolve) => {
    titleEl = document.createElement('div');
    titleEl.id = 'title-screen';

    const doodles = document.createElement('div');
    doodles.id = 'title-doodles';
    const emojis = ['✉️', '💌', '📮', '🌸', '🍃', '⭐', '🌈', '🕊️'];
    for (let i = 0; i < 10; i++) {
      const d = document.createElement('div');
      d.className = 'doodle';
      d.textContent = emojis[i % emojis.length];
      d.style.left = `${5 + Math.random() * 90}%`;
      d.style.top = `${5 + Math.random() * 90}%`;
      d.style.animationDelay = `${Math.random() * 7}s`;
      d.style.fontSize = `${20 + Math.random() * 22}px`;
      doodles.appendChild(d);
    }

    const card = document.createElement('div');
    card.id = 'title-card';
    const h1 = document.createElement('h1');
    h1.id = 'title-main';
    h1.textContent = 'TINY POST';
    const sub = document.createElement('p');
    sub.id = 'title-sub';
    sub.textContent = 'a little mail game across India';
    const begin = document.createElement('button');
    begin.id = 'title-begin';
    begin.textContent = 'BEGIN';
    begin.addEventListener('click', () => {
      titleEl?.classList.add('hidden');
      window.setTimeout(() => {
        titleEl?.remove();
        titleEl = null;
      }, 550);
      resolve();
    });
    card.append(h1, sub, begin);
    titleEl.append(doodles, card);
    document.body.appendChild(titleEl);
  });
}

/** Is the title screen currently up? */
export function isTitleUp(): boolean {
  return titleEl !== null;
}
