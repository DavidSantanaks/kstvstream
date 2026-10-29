/* Native touch/trackpad scrolling, with mouse dragging for the home shelves. */
(function () {
  'use strict';

  const DRAG_THRESHOLD = 7;
  let gesture = null;
  let suppressedClick = null;

  function getTrack(target) {
    return target instanceof Element ? target.closest('.home-row-track') : null;
  }

  function finishGesture() {
    if (!gesture) return;
    const current = gesture;
    gesture = null;
    current.track.classList.remove('is-dragging');
    if (current.dragging) {
      suppressedClick = { track: current.track, until: Date.now() + 500 };
    }
    if (current.track.hasPointerCapture(current.pointerId)) {
      current.track.releasePointerCapture(current.pointerId);
    }
  }

  document.addEventListener('pointerdown', function (event) {
    // Touch keeps the browser's native momentum and vertical page scrolling.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    finishGesture();
    suppressedClick = null;
    const track = getTrack(event.target);
    if (!track || track.scrollWidth <= track.clientWidth) return;
    gesture = {
      track: track,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScroll: track.scrollLeft,
      dragging: false
    };
  });

  document.addEventListener('pointermove', function (event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      finishGesture();
      return;
    }
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        finishGesture();
        return;
      }
      gesture.dragging = true;
      gesture.track.classList.add('is-dragging');
      gesture.track.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    gesture.track.scrollLeft = gesture.startScroll - dx;
  }, { passive: false });

  function onPointerEnd(event) {
    if (gesture && gesture.pointerId === event.pointerId) finishGesture();
  }

  document.addEventListener('pointerup', onPointerEnd);
  document.addEventListener('pointercancel', onPointerEnd);
  document.addEventListener('lostpointercapture', onPointerEnd);
  window.addEventListener('blur', finishGesture);

  // An image's browser drag otherwise interrupts pointer movement on posters.
  document.addEventListener('dragstart', function (event) {
    if (getTrack(event.target)) event.preventDefault();
  });

  document.addEventListener('click', function (event) {
    // Keyboard/remote activation has detail === 0 and must remain available.
    if (event.detail === 0 || !suppressedClick) return;
    if (Date.now() > suppressedClick.until) {
      suppressedClick = null;
      return;
    }
    if (getTrack(event.target) === suppressedClick.track) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressedClick = null;
    }
  }, true);
}());
