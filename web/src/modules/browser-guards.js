let activeImmersiveMode = null;
let immersiveModeRequestId = 0;

function isEditableTarget(target) {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-allow-browser-editing]',
  ));
}

function installBrowserInteractionGuards({ blockEdgeSwipe = true } = {}) {
  const edgeSwipeState = {
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
  };

  const preventOutsideEditable = (event) => {
    if (!isEditableTarget(event.target)) {
      event.preventDefault();
    }
  };
  const preventCopyOutsideEditable = (event) => {
    if (!isEditableTarget(event.target)) {
      event.preventDefault();
      event.clipboardData?.clearData();
    }
  };
  const preventDrag = (event) => {
    if (!isEditableTarget(event.target)) {
      event.preventDefault();
    }
  };
  const onPointerDown = (event) => {
    if (!blockEdgeSwipe || event.pointerType === 'mouse' || isEditableTarget(event.target)) {
      edgeSwipeState.active = false;
      return;
    }
    const edgeWidth = Math.min(36, window.innerWidth * 0.08);
    edgeSwipeState.active = event.clientX <= edgeWidth || event.clientX >= window.innerWidth - edgeWidth;
    edgeSwipeState.pointerId = event.pointerId;
    edgeSwipeState.startX = event.clientX;
    edgeSwipeState.startY = event.clientY;
  };
  const onPointerMove = (event) => {
    if (!edgeSwipeState.active || event.pointerId !== edgeSwipeState.pointerId) return;
    const deltaX = Math.abs(event.clientX - edgeSwipeState.startX);
    const deltaY = Math.abs(event.clientY - edgeSwipeState.startY);
    if (deltaX > 8 && deltaX > deltaY) {
      event.preventDefault();
    }
  };
  const resetPointer = (event) => {
    if (event.pointerId !== edgeSwipeState.pointerId) return;
    edgeSwipeState.active = false;
    edgeSwipeState.pointerId = -1;
  };
  const onGesture = (event) => {
    event.preventDefault();
  };

  document.addEventListener('contextmenu', preventOutsideEditable);
  document.addEventListener('selectstart', preventOutsideEditable);
  document.addEventListener('copy', preventCopyOutsideEditable);
  document.addEventListener('cut', preventCopyOutsideEditable);
  document.addEventListener('dragstart', preventDrag);
  document.addEventListener('pointerdown', onPointerDown, { passive: false });
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', resetPointer);
  document.addEventListener('pointercancel', resetPointer);
  document.addEventListener('gesturestart', onGesture);
  document.addEventListener('gesturechange', onGesture);
  document.addEventListener('gestureend', onGesture);

  return () => {
    document.removeEventListener('contextmenu', preventOutsideEditable);
    document.removeEventListener('selectstart', preventOutsideEditable);
    document.removeEventListener('copy', preventCopyOutsideEditable);
    document.removeEventListener('cut', preventCopyOutsideEditable);
    document.removeEventListener('dragstart', preventDrag);
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', resetPointer);
    document.removeEventListener('pointercancel', resetPointer);
    document.removeEventListener('gesturestart', onGesture);
    document.removeEventListener('gesturechange', onGesture);
    document.removeEventListener('gestureend', onGesture);
  };
}

function getFullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
}

async function requestFullscreen() {
  if (getFullscreenElement()) return true;
  const root = document.documentElement;
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen ?? root.webkitRequestFullScreen;
  if (!request) return false;
  try {
    await request.call(root);
    return true;
  } catch {
    return false;
  }
}

function exitFullscreen() {
  if (!getFullscreenElement()) return;
  const exit = document.exitFullscreen ?? document.webkitExitFullscreen ?? document.webkitCancelFullScreen;
  if (exit) {
    void exit.call(document);
  }
}

async function requestWakeLock() {
  if (!navigator.wakeLock) {
    return { release() {} };
  }
  let released = false;
  let sentinel = null;

  const acquire = async () => {
    if (released || document.visibilityState !== 'visible') return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch {
      sentinel = null;
    }
  };
  const releaseSentinel = () => {
    if (sentinel && !sentinel.released) {
      void sentinel.release();
    }
    sentinel = null;
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      releaseSentinel();
      return;
    }
    if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
      void acquire();
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  await acquire();
  return {
    release() {
      released = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseSentinel();
    },
  };
}

async function enterImmersiveMode() {
  releaseImmersiveMode();
  immersiveModeRequestId += 1;
  const requestId = immersiveModeRequestId;
  const fullscreenPromise = requestFullscreen();
  const wakeLockPromise = requestWakeLock();
  const fullscreen = await fullscreenPromise;
  const wakeLock = await wakeLockPromise;
  let released = false;
  const handle = {
    fullscreen,
    release() {
      if (released) return;
      released = true;
      wakeLock.release();
      if (fullscreen) {
        exitFullscreen();
      }
      if (activeImmersiveMode === handle) {
        activeImmersiveMode = null;
      }
    },
  };

  if (requestId !== immersiveModeRequestId) {
    handle.release();
    return handle;
  }
  activeImmersiveMode = handle;
  return handle;
}

function releaseImmersiveMode() {
  immersiveModeRequestId += 1;
  activeImmersiveMode?.release();
  activeImmersiveMode = null;
}

export { enterImmersiveMode, installBrowserInteractionGuards, releaseImmersiveMode };
