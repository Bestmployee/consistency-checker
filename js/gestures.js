// Distinguishes a tap from a long-press on a touch/mouse target using Pointer
// Events, and suppresses the two classic mobile bugs: (1) a long-press also
// firing a tap afterward, and (2) a long-press opening Android's native
// text-selection/context menu.
// A press held past LONG_PRESS_MS counts as a long-press, but onLongPress only
// runs when the pointer is released. Acting while the finger is still down (e.g.
// navigating away) leaves an unfinished touch that the browser can later route
// to the wrong day after Back. Moving past the tolerance or a pointercancel
// abandons the gesture: neither action runs.

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

function attach(element, { onTap, onLongPress }) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pressActive = false;
  let longPressReached = false;

  function reset() {
    clearTimeout(timer);
    pressActive = false;
    longPressReached = false;
  }

  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  element.style.webkitTouchCallout = 'none';
  element.style.touchAction = 'manipulation';

  element.addEventListener('contextmenu', (e) => e.preventDefault());

  element.addEventListener('pointerdown', (e) => {
    reset();
    startX = e.clientX;
    startY = e.clientY;
    pressActive = true;
    timer = setTimeout(() => {
      longPressReached = true;
    }, LONG_PRESS_MS);
  });

  element.addEventListener('pointermove', (e) => {
    if (!pressActive) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      reset();
    }
  });

  element.addEventListener('pointerup', () => {
    if (!pressActive) return; // no matching pointerdown, or the gesture was abandoned
    const wasLongPress = longPressReached;
    reset();
    if (wasLongPress) {
      onLongPress();
    } else {
      onTap();
    }
  });

  element.addEventListener('pointercancel', reset);
}

window.Gestures = { attach };
