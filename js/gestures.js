// Distinguishes a tap from a long-press on a touch/mouse target using Pointer
// Events, and suppresses the two classic mobile bugs: (1) a long-press also
// firing a tap afterward, and (2) a long-press opening Android's native
// text-selection/context menu.

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

function attach(element, { onTap, onLongPress }) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let longPressFired = false;

  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  element.style.webkitTouchCallout = 'none';
  element.style.touchAction = 'manipulation';

  element.addEventListener('contextmenu', (e) => e.preventDefault());

  element.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    longPressFired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      longPressFired = true;
      onLongPress();
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (e) => {
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      clearTimeout(timer);
    }
  });

  element.addEventListener('pointerup', () => {
    clearTimeout(timer);
    if (longPressFired) {
      longPressFired = false;
      return; // suppress the tap that would otherwise follow a long-press
    }
    onTap();
  });

  element.addEventListener('pointercancel', () => {
    clearTimeout(timer);
    longPressFired = false;
  });
}

window.Gestures = { attach };
