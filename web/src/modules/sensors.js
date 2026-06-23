const TWO_PI = Math.PI * 2;
const DEFAULT_FRAME_DT_SECONDS = 1 / 60;
const DEFAULT_BASELINE_RMS = 0.35;
const STEP_THRESHOLD_MULTIPLIER = 3.2;
const MIN_EFFECTIVE_BASELINE_RMS = 0.05;
// Refractory: minimum time between two counted steps. Raised from 250ms because at the
// 90BPM calibration target real steps are ~667ms apart while a single step's heel/push
// double-peak lands ~330ms later — too short a refractory counts that twice (→ 180/min).
// main.js overrides this per target cadence via setMinStepIntervalMs.
const MIN_STEP_INTERVAL_MS = 333;
const GRAVITY_LOW_PASS_ALPHA = 0.92;

function smoothingFactor(cutoff, dtSeconds) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dtSeconds);
}

function lowPass(current, previous, alpha) {
  return alpha * current + (1 - alpha) * previous;
}

function normalizeDegrees(value) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function shortestAngleDelta(current, previous) {
  const delta = normalizeDegrees(current) - normalizeDegrees(previous);
  if (delta > 180) return delta - 360;
  if (delta < -180) return delta + 360;
  return delta;
}

function finiteOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function finiteOrUndefined(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function vectorMagnitude(vector) {
  return Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
}

function readTimestamp(event) {
  if (Number.isFinite(event.timeStamp) && event.timeStamp > 0) {
    return event.timeStamp;
  }
  return performance.now();
}

function readOptionalVector(source) {
  if (!source) return null;
  return {
    x: finiteOrZero(source.x),
    y: finiteOrZero(source.y),
    z: finiteOrZero(source.z),
  };
}

function readLinearAcceleration(event) {
  return readOptionalVector(event.acceleration);
}

function readRawAcceleration(event) {
  return readOptionalVector(event.accelerationIncludingGravity)
    ?? readOptionalVector(event.acceleration)
    ?? { x: 0, y: 0, z: 0 };
}

function readOrientation(event) {
  return {
    alpha: finiteOrUndefined(event.alpha),
    beta: finiteOrUndefined(event.beta),
    gamma: finiteOrUndefined(event.gamma),
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

class OneEuroAxisFilter {
  constructor(minCutoff, beta, derivativeCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.lastRaw = null;
    this.lastFiltered = null;
    this.lastDerivative = 0;
    this.lastTimestamp = null;
  }

  filter(value, timestamp) {
    if (this.lastRaw === null || this.lastFiltered === null || this.lastTimestamp === null) {
      this.lastRaw = value;
      this.lastFiltered = value;
      this.lastTimestamp = timestamp;
      return value;
    }

    const rawDtSeconds = (timestamp - this.lastTimestamp) / 1000;
    const dtSeconds = Number.isFinite(rawDtSeconds) && rawDtSeconds > 0
      ? rawDtSeconds
      : DEFAULT_FRAME_DT_SECONDS;
    const derivative = (value - this.lastRaw) / dtSeconds;
    const derivativeAlpha = smoothingFactor(this.derivativeCutoff, dtSeconds);
    const smoothedDerivative = lowPass(derivative, this.lastDerivative, derivativeAlpha);
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothedDerivative);
    const valueAlpha = smoothingFactor(cutoff, dtSeconds);
    const filtered = lowPass(value, this.lastFiltered, valueAlpha);

    this.lastRaw = value;
    this.lastFiltered = filtered;
    this.lastDerivative = smoothedDerivative;
    this.lastTimestamp = timestamp;
    return filtered;
  }

  reset() {
    this.lastRaw = null;
    this.lastFiltered = null;
    this.lastDerivative = 0;
    this.lastTimestamp = null;
  }
}

class OrientationOneEuroFilter {
  constructor() {
    this.alphaFilter = new OneEuroAxisFilter(1.2, 0.02, 1);
    this.betaFilter = new OneEuroAxisFilter(1.2, 0.02, 1);
    this.gammaFilter = new OneEuroAxisFilter(1.2, 0.02, 1);
    this.lastAlphaRaw = null;
    this.orientation = { alpha: 0, beta: 0, gamma: 0 };
  }

  filter(input, timestamp) {
    const rawAlpha = input.alpha ?? this.orientation.alpha;
    const unwrappedAlpha = this.lastAlphaRaw === null
      ? rawAlpha
      : this.lastAlphaRaw + shortestAngleDelta(rawAlpha, this.lastAlphaRaw);
    this.lastAlphaRaw = unwrappedAlpha;

    this.orientation = {
      alpha: normalizeDegrees(this.alphaFilter.filter(unwrappedAlpha, timestamp)),
      beta: this.betaFilter.filter(input.beta ?? this.orientation.beta, timestamp),
      gamma: this.gammaFilter.filter(input.gamma ?? this.orientation.gamma, timestamp),
    };
    return this.orientation;
  }

  get() {
    return this.orientation;
  }

  reset() {
    this.alphaFilter.reset();
    this.betaFilter.reset();
    this.gammaFilter.reset();
    this.lastAlphaRaw = null;
    this.orientation = { alpha: 0, beta: 0, gamma: 0 };
  }
}

class GravityCompensator {
  constructor() {
    this.gravity = null;
  }

  remove(raw) {
    if (this.gravity === null) {
      this.gravity = { ...raw };
      return { x: 0, y: 0, z: 0 };
    }

    this.gravity = {
      x: GRAVITY_LOW_PASS_ALPHA * this.gravity.x + (1 - GRAVITY_LOW_PASS_ALPHA) * raw.x,
      y: GRAVITY_LOW_PASS_ALPHA * this.gravity.y + (1 - GRAVITY_LOW_PASS_ALPHA) * raw.y,
      z: GRAVITY_LOW_PASS_ALPHA * this.gravity.z + (1 - GRAVITY_LOW_PASS_ALPHA) * raw.z,
    };
    return {
      x: raw.x - this.gravity.x,
      y: raw.y - this.gravity.y,
      z: raw.z - this.gravity.z,
    };
  }

  reset() {
    this.gravity = null;
  }
}

class StepPeakDetector {
  constructor() {
    this.lastStepAt = Number.NEGATIVE_INFINITY;
    this.previous = null;
    this.previousPrevious = null;
    this.threshold = DEFAULT_BASELINE_RMS * STEP_THRESHOLD_MULTIPLIER;
    this.minStepIntervalMs = MIN_STEP_INTERVAL_MS;
  }

  setBaselineRms(baselineRms) {
    this.threshold = Math.max(baselineRms, MIN_EFFECTIVE_BASELINE_RMS) * STEP_THRESHOLD_MULTIPLIER;
  }

  setMinStepIntervalMs(ms) {
    if (Number.isFinite(ms) && ms > 0) {
      this.minStepIntervalMs = ms;
    }
  }

  update(magnitude, timestamp) {
    let stepEvent = false;
    if (this.previous && this.previousPrevious) {
      const isPeak = this.previous.magnitude > this.threshold
        && this.previous.magnitude > this.previousPrevious.magnitude
        && this.previous.magnitude >= magnitude;
      const hasSpacing = this.previous.timestamp - this.lastStepAt > this.minStepIntervalMs;
      if (isPeak && hasSpacing) {
        this.lastStepAt = this.previous.timestamp;
        stepEvent = true;
      }
    }
    this.previousPrevious = this.previous;
    this.previous = { magnitude, timestamp };
    return stepEvent;
  }

  reset() {
    // Keep threshold and minStepIntervalMs — they are calibrated settings, not per-run state.
    this.lastStepAt = Number.NEGATIVE_INFINITY;
    this.previous = null;
    this.previousPrevious = null;
  }
}

class SensorBusImpl {
  constructor() {
    this.gravityCompensator = new GravityCompensator();
    this.orientationFilter = new OrientationOneEuroFilter();
    this.stepDetector = new StepPeakDetector();
    this.subscribers = new Set();
    this.calibration = null;
    this.running = false;
    this.startGeneration = 0;
    this.orientationSampleCount = 0;
    this.handleMotion = (event) => {
      const timestamp = readTimestamp(event);
      const accel = readLinearAcceleration(event)
        ?? this.gravityCompensator.remove(readRawAcceleration(event));
      const magnitude = vectorMagnitude(accel);

      this.recordCalibrationSample(magnitude);
      this.emit({
        accel,
        orientation: this.orientationFilter.get(),
        stepEvent: this.stepDetector.update(magnitude, timestamp),
        timestamp,
      });
    };
    this.handleOrientation = (event) => {
      this.orientationFilter.filter(readOrientation(event), readTimestamp(event));
      this.orientationSampleCount += 1;
    };
  }

  async start() {
    if (this.running) return;
    const startGeneration = ++this.startGeneration;
    await requestSensorPermission();
    if (startGeneration !== this.startGeneration) {
      throw new Error('Sensor start was cancelled.');
    }
    window.addEventListener('devicemotion', this.handleMotion, { passive: true });
    window.addEventListener('deviceorientation', this.handleOrientation, { passive: true });
    this.running = true;
  }

  stop() {
    this.startGeneration += 1;
    window.removeEventListener('devicemotion', this.handleMotion);
    window.removeEventListener('deviceorientation', this.handleOrientation);
    if (this.calibration) {
      clearTimeout(this.calibration.timeoutId);
      this.calibration.reject(new Error('Sensor calibration was stopped before it completed.'));
      this.calibration = null;
    }
    this.gravityCompensator.reset();
    this.orientationFilter.reset();
    this.stepDetector.reset();
    this.orientationSampleCount = 0;
    this.running = false;
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  setBaselineRms(baselineRms) {
    if (Number.isFinite(baselineRms) && baselineRms > 0) {
      this.stepDetector.setBaselineRms(baselineRms);
    }
  }

  setMinStepIntervalMs(ms) {
    this.stepDetector.setMinStepIntervalMs(ms);
  }

  async calibrate(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Sensor calibration duration must be positive.');
    }
    if (this.calibration) {
      throw new Error('Sensor calibration is already running.');
    }
    if (!this.running) {
      await this.start();
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const calibration = this.calibration;
        if (!calibration) return;
        this.calibration = null;
        if (calibration.count === 0) {
          reject(new Error('Sensor calibration did not receive any motion samples.'));
          return;
        }
        if (this.orientationSampleCount === 0) {
          reject(new Error('Sensor calibration did not receive any orientation samples.'));
          return;
        }
        const baselineRms = Math.sqrt(calibration.sumSquares / calibration.count);
        this.stepDetector.setBaselineRms(baselineRms);
        this.stepDetector.reset();
        resolve({
          baselineRms,
          orientation: this.orientationFilter.get(),
        });
      }, durationMs);
      this.calibration = {
        count: 0,
        reject,
        resolve,
        sumSquares: 0,
        timeoutId,
      };
    });
  }

  emit(state) {
    for (const subscriber of this.subscribers) {
      subscriber(state);
    }
  }

  recordCalibrationSample(magnitude) {
    if (!this.calibration) return;
    this.calibration.sumSquares += magnitude * magnitude;
    this.calibration.count += 1;
  }
}

async function requestSensorPermission() {
  if (!('DeviceMotionEvent' in window)) {
    throw new Error('Device motion events are not available.');
  }
  if (!('DeviceOrientationEvent' in window)) {
    throw new Error('Device orientation events are not available.');
  }

  const motionCtor = window.DeviceMotionEvent;
  if (typeof motionCtor?.requestPermission === 'function') {
    let result;
    try {
      result = await motionCtor.requestPermission();
    } catch (error) {
      throw new Error(`Motion sensor permission request failed: ${errorMessage(error)}`);
    }
    if (result !== 'granted') {
      throw new Error('Motion sensor permission was denied.');
    }
  }

  const orientationCtor = window.DeviceOrientationEvent;
  if (typeof orientationCtor?.requestPermission === 'function') {
    let result;
    try {
      result = await orientationCtor.requestPermission();
    } catch (error) {
      throw new Error(`Orientation sensor permission request failed: ${errorMessage(error)}`);
    }
    if (result !== 'granted') {
      throw new Error('Orientation sensor permission was denied.');
    }
  }
}

function shortestAngleDeltaDeg(current, origin) {
  return ((((current - origin) % 360) + 540) % 360) - 180;
}

function createSensorBus() {
  return new SensorBusImpl();
}

export { createSensorBus, shortestAngleDeltaDeg };
