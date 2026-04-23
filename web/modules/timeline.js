/**
 * Timeline state and UI controls.
 * Manages play/pause, current frame, speed, IN/OUT markers.
 */

export class Timeline {
  constructor({ onFrameChange, onInOutChange }) {
    this.onFrameChange = onFrameChange;
    this.onInOutChange = onInOutChange || (() => {});

    this.totalFrames = 0;
    this.fps = 120;
    this.currentFrame = 0;
    this.playing = false;
    this.speedFactor = 1.0;

    this.inFrame = null;
    this.outFrame = null;

    this._lastTimestamp = null;
    this._rafId = null;
    this._elapsed = 0; // seconds of playback elapsed

    // DOM refs
    this.slider = document.getElementById('frame-slider');
    this.frameDisplay = document.getElementById('frame-display');
    this.inDisplay = document.getElementById('in-display');
    this.outDisplay = document.getElementById('out-display');
    this.inMarker = document.getElementById('in-marker');
    this.outMarker = document.getElementById('out-marker');
    this.btnPlay = document.getElementById('btn-play');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnNext = document.getElementById('btn-next');
    this.speedSelect = document.getElementById('speed-select');
    this.btnResetInOut = document.getElementById('btn-reset-inout');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnPlay.addEventListener('click', () => this.togglePlay());
    this.btnPrev.addEventListener('click', () => this.stepFrame(-1));
    this.btnNext.addEventListener('click', () => this.stepFrame(1));

    this.slider.addEventListener('input', () => {
      const f = parseInt(this.slider.value, 10);
      this._setFrame(f, true);
    });

    this.speedSelect.addEventListener('change', () => {
      this.speedFactor = parseFloat(this.speedSelect.value);
    });

    this.btnResetInOut.addEventListener('click', () => this.resetInOut());

    document.addEventListener('keydown', (e) => {
      // Don't steal keys from text-entry fields, but allow the range slider
      // (which grabs focus on click) to still pass shortcuts through.
      const t = e.target;
      if (t && t.tagName === 'TEXTAREA') return;
      if (t && t.tagName === 'INPUT') {
        const type = (t.type || '').toLowerCase();
        if (type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button') return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'KeyI':
          this.setIn(this.currentFrame);
          break;
        case 'KeyO':
          this.setOut(this.currentFrame);
          break;
        case 'KeyR':
          this.resetInOut();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (!this.playing) this.stepFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (!this.playing) this.stepFrame(1);
          break;
      }
    });
  }

  /** Load a new clip (resets playback). */
  load(totalFrames, fps = 120) {
    this.totalFrames = totalFrames;
    this.fps = fps;
    this.currentFrame = 0;
    this.inFrame = null;
    this.outFrame = null;
    this._elapsed = 0;
    this._lastTimestamp = null;

    this.slider.min = 0;
    this.slider.max = Math.max(0, totalFrames - 1);
    this.slider.value = 0;

    this._updateDisplay();
    this._updateMarkers();
    this.onFrameChange(0);
  }

  togglePlay() {
    if (this.totalFrames === 0) return;
    this.playing ? this.pause() : this.play();
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    this.btnPlay.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>'; // pause
    this._lastTimestamp = null;
    this._scheduleRaf();
  }

  pause() {
    this.playing = false;
    this.btnPlay.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3"/></svg>'; // play
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  stepFrame(delta) {
    if (this.totalFrames === 0) return;
    const f = Math.max(0, Math.min(this.totalFrames - 1, this.currentFrame + delta));
    this._setFrame(f, true);
  }

  setIn(frame) {
    this.inFrame = frame;
    this._reanchorElapsed();
    this._updateDisplay();
    this._updateMarkers();
    this.onInOutChange();
  }

  setOut(frame) {
    this.outFrame = frame;
    this._reanchorElapsed();
    this._updateDisplay();
    this._updateMarkers();
    this.onInOutChange();
  }

  _reanchorElapsed() {
    // Keep playback continuous across IN/OUT changes: re-express elapsed
    // relative to the new start of the loop range, based on currentFrame.
    const startFrame = this.inFrame ?? 0;
    this._elapsed = Math.max(0, (this.currentFrame - startFrame) / this.fps);
    this._lastTimestamp = null;
  }

  resetInOut() {
    this.inFrame = null;
    this.outFrame = null;
    this._reanchorElapsed();
    this._updateDisplay();
    this._updateMarkers();
    this.onInOutChange();
  }

  _scheduleRaf() {
    this._rafId = requestAnimationFrame((ts) => {
      if (!this.playing) return;

      if (this._lastTimestamp === null) {
        this._lastTimestamp = ts;
      }
      const dtSec = (ts - this._lastTimestamp) / 1000;
      this._lastTimestamp = ts;
      this._elapsed += dtSec * this.speedFactor;

      const startFrame = this.inFrame ?? 0;
      const endFrame = this.outFrame ?? (this.totalFrames - 1);
      const rangeLen = endFrame - startFrame + 1;

      if (rangeLen <= 0) {
        this._scheduleRaf();
        return;
      }

      const framesElapsed = Math.floor(this._elapsed * this.fps);
      const f = startFrame + (framesElapsed % rangeLen);

      this._setFrame(f, false);
      this._scheduleRaf();
    });
  }

  _setFrame(frame, resetElapsed) {
    this.currentFrame = frame;
    this.slider.value = frame;
    if (resetElapsed) {
      const startFrame = this.inFrame ?? 0;
      this._elapsed = (frame - startFrame) / this.fps;
      this._lastTimestamp = null;
    }
    this._updateDisplay();
    this.onFrameChange(frame);
  }

  _updateDisplay() {
    const total = this.totalFrames;
    const cur = this.currentFrame;
    const curSec = (cur / this.fps).toFixed(2);
    const totSec = (Math.max(0, total - 1) / this.fps).toFixed(2);
    this.frameDisplay.textContent = `${cur}/${Math.max(0, total - 1)}  ${curSec}s / ${totSec}s`;

    this.inDisplay.textContent = this.inFrame !== null
      ? `IN: ${(this.inFrame / this.fps).toFixed(2)}s`
      : 'IN: \u2014';
    this.outDisplay.textContent = this.outFrame !== null
      ? `OUT: ${(this.outFrame / this.fps).toFixed(2)}s`
      : 'OUT: \u2014';
  }

  _updateMarkers() {
    const total = this.totalFrames;
    if (total < 2) {
      this.inMarker.style.display = 'none';
      this.outMarker.style.display = 'none';
      return;
    }

    const setMarker = (marker, frame) => {
      if (frame === null) {
        marker.style.display = 'none';
        return;
      }
      marker.style.display = 'block';
      const pct = frame / (total - 1) * 100;
      marker.style.left = `${pct}%`;
    };

    setMarker(this.inMarker, this.inFrame);
    setMarker(this.outMarker, this.outFrame);
  }
}
