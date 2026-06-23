import './style.css';
import { saveGameProgress, loadGameProgress, clearGameProgress } from './modules/game-state.js';
import { enterImmersiveMode, installBrowserInteractionGuards, releaseImmersiveMode } from './modules/browser-guards.js';
import { createSensorBus, shortestAngleDeltaDeg } from './modules/sensors.js';
import { createDialogueVoicePlayer } from './modules/dialogue-voice.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Random NPC dialogue-voice player (爷爷 / 小满 / 其他 NPC 复用)。仅造"正在说话"的
// 拟声效果，不与中文文字一一对应。详见 modules/dialogue-voice.js。
const dialogueVoice = createDialogueVoicePlayer();

const canvas = document.querySelector('#stage');
const statusEl = document.querySelector('#status');
const buttons = [...document.querySelectorAll('[data-mode]')];
const debugToggle = document.querySelector('#debug-toggle');
const debugPanel = document.querySelector('#debug-panel');
const debugClose = document.querySelector('#debug-close');
const debugHitEl = document.querySelector('#debug-hit');
const debugCopy = document.querySelector('#debug-copy');
const debugClear = document.querySelector('#debug-clear');
const debugList = document.querySelector('#debug-list');
const mailboxQuestPanel = document.querySelector('#mailbox-quest');
const questClose = document.querySelector('#quest-close');
const questHint = document.querySelector('#quest-hint');
const propertyBag = document.querySelector('#property-bag');
const propertyItems = [...document.querySelectorAll('[data-property-item]')];
const propertyImages = [...document.querySelectorAll('[data-property-image]')].reduce((images, image) => {
  images[image.dataset.propertyImage] = image;
  return images;
}, {});
const schoolQuestPanel = document.querySelector('#school-quest');
const schoolQuestClose = document.querySelector('#school-quest-close');
const schoolSortStage = document.querySelector('#school-sort-stage');
const schoolSortHint = document.querySelector('#school-sort-hint');
const schoolSortSubmit = document.querySelector('#school-sort-submit');
const schoolSortReset = document.querySelector('#school-sort-reset');
const schoolSortSources = [...document.querySelectorAll('[data-school-sort-tile]')];
const schoolSortSlots = [...document.querySelectorAll('[data-school-sort-slot]')];
const objectiveArrowEl = document.querySelector('#objective-arrow');
const objectiveDistanceEl = document.querySelector('#objective-distance');
const talkPromptEl = document.querySelector('#talk-prompt');
const grandpaSayEl = document.querySelector('#grandpa-say');
const grandpaSayTextEl = document.querySelector('#grandpa-say-text');
const modeFadeEl = document.querySelector('#mode-fade');
const uiScreens = {
  loading: document.querySelector('#loading-screen'),
  calibration: document.querySelector('#calibration-screen'),
  taskToast: document.querySelector('#task-toast'),
  dialog: document.querySelector('#dialog-panel'),
  memory: document.querySelector('#memory-modal'),
  delivery: document.querySelector('#delivery-panel'),
  pause: document.querySelector('#pause-screen'),
  settings: document.querySelector('#settings-screen'),
  ending: document.querySelector('#ending-screen'),
  listen: document.querySelector('#listen-overlay'),
};
const uiElements = {
  loadingProgress: document.querySelector('#loading-progress'),
  loadingStart: document.querySelector('#loading-start'),
  calibrationStart: document.querySelector('#calibration-start'),
  calibrationSkip: document.querySelector('#calibration-skip'),
  calibrationStatus: document.querySelector('#calibration-status'),
  calibrationMeter: document.querySelector('#calibration-meter'),
  calibrationMeterTrack: document.querySelector('#calibration-meter-track'),
  calibrationGuide: document.querySelector('#calibration-guide'),
  calibrationKicker: document.querySelector('#calibration-kicker'),
  calibrationTitle: document.querySelector('#calibration-title'),
  calibrationAngle: document.querySelector('#calibration-angle'),
  calibrationGait: document.querySelector('#calibration-gait'),
  calibrationStepfreq: document.querySelector('#calibration-stepfreq'),
  calibrationBeat: document.querySelector('#calibration-beat'),
  taskLevel: document.querySelector('#task-level'),
  taskText: document.querySelector('#task-text'),
  pauseButton: document.querySelector('#ui-pause'),
  memoryButton: document.querySelector('#ui-memory'),
  settingsButton: document.querySelector('#ui-settings'),
  settingsClose: document.querySelector('#settings-close'),
  dialogSpeaker: document.querySelector('#dialog-speaker'),
  dialogText: document.querySelector('#dialog-text'),
  dialogNext: document.querySelector('#dialog-next'),
  memoryClose: document.querySelector('#memory-close'),
  memoryImage: document.querySelector('#memory-image'),
  memoryCaption: document.querySelector('#memory-caption'),
  deliveryClose: document.querySelector('#delivery-close'),
  deliveryHint: document.querySelector('#delivery-hint'),
  envelopeScratch: document.querySelector('#envelope-scratch'),
  envelopeImage: document.querySelector('#envelope-image'),
  scratchCanvas: document.querySelector('#scratch-canvas'),
  recipientReveal: document.querySelector('#recipient-reveal'),
  openLetter: document.querySelector('#open-letter'),
  letterImage: document.querySelector('#letter-image'),
  signatureArea: document.querySelector('#signature-area'),
  signatureCanvas: document.querySelector('#signature-canvas'),
  submitSignature: document.querySelector('#submit-signature'),
  resumeGame: document.querySelector('#resume-game'),
  restartGame: document.querySelector('#restart-game'),
  endingFrame: document.querySelector('.ending-frame'),
  endingCopy: document.querySelector('#ending-screen .ending-copy'),
  endingArt: document.querySelector('#ending-art'),
  endingKicker: document.querySelector('#ending-kicker'),
  endingTitle: document.querySelector('#ending-title'),
  endingText: document.querySelector('#ending-text'),
  endingNext: document.querySelector('#ending-next'),
  listenStory: document.querySelector('#listen-story'),
  listenMeter: document.querySelector('#listen-meter'),
  listenButton: document.querySelector('#listen-button'),
  listenHint: document.querySelector('#listen-hint'),
};

const params = new URLSearchParams(window.location.search);
const fullRenderHosts = new Set(['game.isduanna.art']);
const isFullRenderHost = fullRenderHosts.has(window.location.hostname);
const isMobileRuntime = matchMedia('(pointer: coarse), (max-width: 760px)').matches;
const qualityParam = params.get('quality') ?? (isFullRenderHost ? 'desktop' : 'auto');
const normalizedQuality = ['auto', 'lite', 'desktop'].includes(qualityParam) ? qualityParam : 'auto';
const controlsParam = params.get('controls') ?? (isMobileRuntime ? 'sensor' : 'desktop');
const forcesMobileControls = controlsParam === 'sensor' || controlsParam === 'joystick';
const normalizedControls = ['sensor', 'joystick', 'desktop'].includes(controlsParam) ? controlsParam : (isMobileRuntime ? 'sensor' : 'desktop');
const usesMobileShell = isMobileRuntime || forcesMobileControls;
const runtimeConfig = {
  quality: normalizedQuality,
  requestedControls: normalizedControls,
  isMobile: usesMobileShell,
  lite: normalizedQuality === 'lite',
  sceneVariant: normalizedQuality === 'lite' ? 'mobile' : 'full',
  classicRender: normalizedQuality !== 'lite',
  dpr: 1,
  composerDpr: 1,
  outlineEnabled: normalizedQuality !== 'lite',
};

const performanceStats = {
  startedAt: performance.now(),
  sceneLoadMs: 0,
  collisionLoadMs: 0,
  grandpaLoadMs: 0,
  lodLoadMs: 0,
  fps: 0,
  frameCount: 0,
  lastFpsAt: performance.now(),
  paused: false,
  contextLost: false,
};

let lodLoadQueued = false;

const sceneCache = {
  visibleContentBox: null,
  visibleContentSize: new THREE.Vector3(),
  visibleContentCenter: new THREE.Vector3(),
  debugPickObjects: null,
  grandpaPickObjects: null,
  outlineObjects: [],
  streetLightCandidates: null,
  groundLightY: null,
  stylizedRoots: new Set(),
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: runtimeConfig.quality !== 'lite',
  powerPreference: 'high-performance',
});
configureRenderQuality();
renderer.setPixelRatio(runtimeConfig.dpr);
renderer.setClearColor(0xb9e6e0, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9e6e0);
scene.fog = new THREE.Fog(0xb9e6e0, 720, 1800);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2200);
camera.position.set(215, 178, 260);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.52;
controls.target.set(0, 35, 0);

const sun = new THREE.DirectionalLight(0xfff1c5, 2.2);
sun.position.set(170, 260, 90);
scene.add(sun);

const sunTarget = new THREE.Object3D();
sun.target = sunTarget;
scene.add(sunTarget);

const fill = new THREE.HemisphereLight(0xd8fff7, 0xffd78b, 2.4);
scene.add(fill);

const nightGlow = new THREE.PointLight(0xffc65a, 0, 760, 1.35);
nightGlow.position.set(20, 95, 10);
scene.add(nightGlow);

const rimLight = new THREE.DirectionalLight(0xd9f7ff, 0);
rimLight.position.set(-180, 210, -120);
scene.add(rimLight);

const stylizedLightGroup = new THREE.Group();
stylizedLightGroup.name = 'StylizedLightAccents';
stylizedLightGroup.userData.skipStylize = true;
stylizedLightGroup.userData.excludeFromBounds = true;
scene.add(stylizedLightGroup);

const cloudGroup = new THREE.Group();
cloudGroup.name = 'WorldClouds';
cloudGroup.userData.skipStylize = true;
cloudGroup.userData.excludeFromBounds = true;
scene.add(cloudGroup);

const debugMarkerGroup = new THREE.Group();
debugMarkerGroup.name = 'SpaceDebugMarkers';
debugMarkerGroup.userData.skipStylize = true;
debugMarkerGroup.userData.excludeFromBounds = true;
scene.add(debugMarkerGroup);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const outlinePass = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
outlinePass.edgeStrength = 1.15;
outlinePass.edgeGlow = 0;
outlinePass.edgeThickness = 0.65;
outlinePass.visibleEdgeColor.set(0x11100d);
outlinePass.hiddenEdgeColor.set(0x11100d);
outlinePass.enabled = runtimeConfig.outlineEnabled;
composer.addPass(outlinePass);

// 陪伴去饱和：玩家走太快、爷爷掉队时，画面渐渐褪色变灰（策划「画面变灰」契约）。
const SaturationShader = {
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse;',
    'uniform float saturation;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec4 color = texture2D(tDiffuse, vUv);',
    '  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));',
    '  gl_FragColor = vec4(mix(vec3(luma), color.rgb, saturation), color.a);',
    '}',
  ].join('\n'),
};
const saturationPass = new ShaderPass(SaturationShader);
composer.addPass(saturationPass);

composer.addPass(new OutputPass());

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const textureLoader = new THREE.TextureLoader();
const toonGradient = new THREE.DataTexture(
  new Uint8Array([
    40, 40, 40,
    122, 122, 122,
    190, 190, 190,
    255, 255, 255,
  ]),
  4,
  1,
  THREE.RGBFormat,
);
toonGradient.minFilter = THREE.NearestFilter;
toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;

const palette = {
  sky: '#b9e6e0',
  ground: '#72bcb6',
  road: '#aeb8bc',
  roadMarking: '#fff7df',
  sidewalk: '#d7e7d8',
  floor: '#d2cba7',
  wall: '#fff5dc',
  roof: '#7f5440',
  wood: '#b98052',
  foliage: '#6a9b62',
  sign: '#f9ca51',
  metal: '#8aa0a1',
  memory: '#ffc257',
  dark: '#292825',
  prop: '#d9cab0',
  grandpaCoat: '#526b43',
};

const nightPalette = {
  sky: '#18233d',
  ground: '#416e73',
  road: '#6a7d82',
  roadMarking: '#fff0be',
  sidewalk: '#78969a',
  floor: '#8e8b6a',
  wall: '#9fb3a8',
  roof: '#42505b',
  wood: '#766856',
  foliage: '#3e6a57',
  sign: '#ffc95c',
  metal: '#607a82',
  memory: '#ffd06b',
  dark: '#111824',
  prop: '#8e9a8d',
  grandpaCoat: '#2f5145',
};

const grandpaColorProfiles = {
  palette: {
    skin: ['#a96552', '#d09672', '#efb78d'],
    hair: ['#9fa8a2', '#d7d9cc', '#fff1d4'],
    fabric: ['#4c4944', '#625e57', '#77716a'],
    green: ['#5d705f', '#8c9a83', '#b4b999'],
    leather: ['#3e2f2a', '#5e4030', '#7e563d'],
    dark: ['#11100d', '#24231f', '#36332d'],
    ink: '#11100d',
  },
  texture: {
    skin: ['#9f644f', '#cf9672', '#ecb48b'],
    hair: ['#98a19c', '#d3d5ca', '#f5ead0'],
    fabric: ['#474541', '#615d57', '#77706a'],
    green: ['#596c5c', '#879683', '#adb79a'],
    leather: ['#3b2d29', '#5a3d2f', '#77523d'],
    dark: ['#11100d', '#24231f', '#34312c'],
    ink: '#11100d',
  },
  memory: {
    skin: ['#9d6046', '#df9969', '#ffbd81'],
    hair: ['#a69d82', '#ded1a4', '#fff0bd'],
    fabric: ['#5d4d3d', '#846d52', '#a58b63'],
    green: ['#77724b', '#aaa05d', '#d0bf78'],
    leather: ['#4a3128', '#734a34', '#9a6541'],
    dark: ['#211914', '#3c2f26', '#584435'],
    ink: '#1b1511',
  },
  night: {
    skin: ['#654a4d', '#a07161', '#c58b70'],
    hair: ['#586775', '#8796a1', '#bbc8c5'],
    fabric: ['#26303c', '#3e4b58', '#60707a'],
    green: ['#314c48', '#4f685e', '#758579'],
    leather: ['#241f21', '#41342f', '#60483b'],
    dark: ['#090e17', '#151b24', '#25303b'],
    ink: '#090e17',
  },
};

const grandpaPartColors = {
  texture: {
    skin: '#d29372',
    skinShadow: '#b87862',
    hair: '#d7d9cc',
    coat: '#526b43',
    sleeve: '#526b43',
    trousers: '#4c4944',
    shoe: '#2b2722',
    scarf: '#c65d4f',
    cane: '#5e4030',
    ink: '#11100d',
  },
  palette: {
    skin: '#d59a74',
    skinShadow: '#b97861',
    hair: '#fff1d4',
    coat: '#8c9a83',
    sleeve: '#8c9a83',
    trousers: '#625e57',
    shoe: '#24231f',
    scarf: '#d66f58',
    cane: '#7e563d',
    ink: '#11100d',
  },
  memory: {
    skin: '#df9969',
    skinShadow: '#b96e4e',
    hair: '#fff0bd',
    coat: '#aaa05d',
    sleeve: '#aaa05d',
    trousers: '#846d52',
    shoe: '#3c2f26',
    scarf: '#d88450',
    cane: '#734a34',
    ink: '#1b1511',
  },
  night: {
    skin: '#a07161',
    skinShadow: '#654a4d',
    hair: '#bbc8c5',
    coat: '#4f685e',
    sleeve: '#4f685e',
    trousers: '#3e4b58',
    shoe: '#151b24',
    scarf: '#8b554f',
    cane: '#60483b',
    ink: '#090e17',
  },
};

const spaceMarkers = {
  grandpaSpawn: {
    id: 1,
    note: '爷爷出生点',
    x: -197.45,
    y: 0,
    z: -25.58,
  },
  mailboxTask: {
    id: 3,
    note: '邮箱任务点',
    x: -211.66,
    y: 0.02,
    z: 12.95,
  },
  schoolTask: {
    id: 5,
    note: '记忆拼图任务点',
    x: -189.04,
    y: -0.1,
    z: 55.41,
  },
  grandpaHomeTask: {
    id: 7,
    note: '爷爷家送信点',
    x: -199.16,
    y: -0.2,
    z: 108.84,
  },
  hennessyRoad1: {
    id: 8,
    note: '轩尼锡道1段',
    x: -194.16,
    y: -0.1,
    z: -13.39,
  },
  playerSpawn: {
    id: 4,
    note: '我的出生点',
    x: -211.79,
    y: -0.01,
    z: -26.94,
  },
};

const grandpaPreview = {
  scale: 1,
  groundLift: 0.02,
  textureMaxSize: 768,
};

const firstPersonPreview = {
  eyeHeight: 2.0625,
  collisionRadius: 0.48,
  collisionHeadInset: 0.24,
  lookAhead: 14,
  lookDown: 0.35,
  moveSpeed: 13.5,
  runMultiplier: 1.65,
  lookSensitivity: 0.0022,
  maxPitch: Math.PI * 0.42,
};

const motionControlConfig = {
  calibrationDurationMs: 5000,
  stepDistance: 5.0, // 每步注入的位移（速度由步频→drainSpeed 决定，基准步频见 CALIBRATION_TARGET_BPM）
  stepSpeed: 5.3, // 基准步频(目标 BPM)对应的舒适排空速度
  maxQueuedStepDistance: 9, // 缓冲约 1.8 步的动量
  walkSpeedMin: 2.0,
  walkSpeedMax: 12,
};
const CALIBRATION_TARGET_BPM = 90;
const METRONOME_BPM = CALIBRATION_TARGET_BPM; // 校准节拍器 & 速度映射的基准步频（步/分）
// 手机端爷爷跟随上限：按 90BPM 走能跟上，明显走快就会拉开 → 触发提醒/丢失。
const companionMobileFollowSpeed = 6.2;

const DELIVERY_STAGE = {
  scratch: 'scratch',
  recipient: 'recipient',
  letter: 'letter',
  signature: 'signature',
  done: 'done',
};

const LEVEL_STARTS = {
  1: { marker: 'playerSpawn', lookAt: 'grandpaSpawn', grandpa: 'spawn' },
  2: { marker: 'playerSpawn', lookAt: 'mailboxTask', grandpa: 'beside' },
  3: { marker: 'mailboxTask', lookAt: 'schoolTask', grandpa: 'beside' },
  4: { marker: 'schoolTask', lookAt: 'grandpaHomeTask', grandpa: 'beside' },
};

const WORLD_CLOUD_LAYOUTS = {
  day: [
    { asset: 0, x: -248, y: 82, z: -82, width: 38, opacity: 0.86 },
    { asset: 2, x: -220, y: 98, z: -94, width: 30, opacity: 0.8 },
    { asset: 3, x: -178, y: 88, z: -70, width: 42, opacity: 0.84 },
    { asset: 4, x: -145, y: 74, z: -28, width: 31, opacity: 0.76 },
    { asset: 1, x: -238, y: 66, z: 18, width: 34, opacity: 0.62 },
    { asset: 2, x: -184, y: 70, z: 34, width: 27, opacity: 0.56 },
    { asset: 0, x: -150, y: 63, z: 72, width: 28, opacity: 0.52 },
  ],
  night: [
    { asset: 2, x: -248, y: 82, z: -82, width: 32, opacity: 0.46 },
    { asset: 4, x: -220, y: 98, z: -94, width: 28, opacity: 0.4 },
    { asset: 1, x: -178, y: 88, z: -70, width: 36, opacity: 0.44 },
    { asset: 3, x: -145, y: 74, z: -28, width: 34, opacity: 0.42 },
    { asset: 0, x: -184, y: 70, z: 34, width: 27, opacity: 0.32 },
    { asset: 2, x: -238, y: 66, z: 18, width: 25, opacity: 0.28 },
  ],
};

const firstPersonInput = {
  keys: new Set(),
  yaw: 0,
  pitch: 0,
  pointerLocked: false,
  lastFrameTime: performance.now(),
};

const mobileInput = {
  mode: runtimeConfig.requestedControls === 'desktop' ? 'desktop' : 'sensor',
  sensorAvailable: false,
  sensorPermission: 'unknown',
  sensorListening: false,
  sensorCheckTimer: 0,
  sensorUnsubscribe: null,
  lastMotionAt: 0,
  motionSampleCount: 0,
  yawZeroDeg: 0,
  yawStart: 0,
  pitchZeroDeg: 0,
  pitchStart: 0,
  queuedStepDistance: 0,
  stepTimes: [], // 滚动步频窗口（游戏内实时配速用）
  liveCadence: 0, // 实时步频（步/分），0 表示当前没在踏步
  referenceCadence: METRONOME_BPM, // 速度映射基准：步频=此值时为舒适速度
  calibrationRunning: false,
  calibrationStartedAt: 0,
  joystickVector: new THREE.Vector2(),
  activeMoveButtons: new Set(),
  lookPointerId: null,
  lookX: 0,
  lookY: 0,
  ui: {},
};

const mobileSensorConfig = {
  permissionTimeoutMs: 2400,
  firstSampleTimeoutMs: 1600,
};
const sensorBus = createSensorBus();
installBrowserInteractionGuards();

// === 体感校准 4 步向导 (E)：guide-1..4 对应「介绍 / 站稳基线 / 转身确认 / 步态灵敏度」 ===
const CALIBRATION_TURN_THRESHOLD_DEG = 20;
const CALIBRATION_STEP_WINDOW_MS = 8000;
const calibrationState = {
  step: 0,
  uiUnsub: null,
  baselineTimer: 0,
  baselineRms: 0,
  turnLeftDone: false,
  turnRightDone: false,
  stepTimes: [],
  matchedCadence: false,
  autoRms: 0, // 自适应自动灵敏度：当前自动阈值基准
  autoTuneAt: 0, // 上次自动微调时间戳
};
const calibrationSteps = {
  1: {
    guide: 0,
    kicker: '体感引导 · 1/4',
    title: '先把手机举在胸前',
    status: '把手机竖直举在胸前、面朝正前方站好。准备好后点「开始体感引导」。',
    primary: '开始体感引导',
  },
  2: {
    guide: 1,
    kicker: '体感引导 · 2/4',
    title: '原地站稳 5 秒',
    status: '保持站姿别动，正在记录你的基线姿态…',
    primary: '校准中…',
  },
  3: {
    guide: 2,
    kicker: '体感引导 · 3/4',
    title: '向左、向右各转一次身',
    status: `原地向左转身超过 ${CALIBRATION_TURN_THRESHOLD_DEG}°，再向右转身超过 ${CALIBRATION_TURN_THRESHOLD_DEG}°。`,
    primary: '进入步态校准',
  },
  4: {
    guide: 3,
    kicker: '体感引导 · 4/4',
    title: '跟 90 次/分钟踏步',
    status: '跟着节拍原地踏步，系统会自动校准识别灵敏度，匹配成功后即可进入游戏。',
    primary: '进入游戏',
  },
};

const cloudSources = [
  '/web/generated/cloud-1.png',
  '/web/generated/cloud-2.png',
  '/web/generated/cloud-3.png',
  '/web/generated/cloud-4.png',
  '/web/generated/cloud-5.png',
];
const cloudTextures = [];
let cloudAssetsReady = false;

const propertyAssets = {
  now: {
    bag: optimizedImage('/web/generated/property_mobile/bag_now.webp', '/web/generated/property_mobile/bag_now.png'),
    mail: optimizedImage('/web/generated/property_mobile/mail_now.webp', '/web/generated/property_mobile/mail_now.png'),
    key1: optimizedImage('/web/generated/property_mobile/key_now_1.webp', '/web/generated/property_mobile/key_now_1.png'),
    key2: optimizedImage('/web/generated/property_mobile/key_now_2.webp', '/web/generated/property_mobile/key_now_2.png'),
    key3: optimizedImage('/web/generated/property_mobile/key_now_3.webp', '/web/generated/property_mobile/key_now_3.png'),
  },
  past: {
    bag: optimizedImage('/web/generated/property_mobile/bag_past.webp', '/web/generated/property_mobile/bag_past.png'),
    mail: optimizedImage('/web/generated/property_mobile/mail_past.webp', '/web/generated/property_mobile/mail_past.png'),
    key1: optimizedImage('/web/generated/property_mobile/key_past_1.webp', '/web/generated/property_mobile/key_past_1.png'),
    key2: optimizedImage('/web/generated/property_mobile/key_past_2.webp', '/web/generated/property_mobile/key_past_2.png'),
    key3: optimizedImage('/web/generated/property_mobile/key_past_3.webp', '/web/generated/property_mobile/key_past_3.png'),
  },
};

const propertyAssetFallbacks = new Map([
  ['/web/generated/property_mobile/bag_now.webp', '/web/generated/property_mobile/bag_now.png'],
  ['/web/generated/property_mobile/bag_past.webp', '/web/generated/property_mobile/bag_past.png'],
  ['/web/generated/property_mobile/mail_now.webp', '/web/generated/property_mobile/mail_now.png'],
  ['/web/generated/property_mobile/mail_past.webp', '/web/generated/property_mobile/mail_past.png'],
  ['/web/generated/property_mobile/key_now_1.webp', '/web/generated/property_mobile/key_now_1.png'],
  ['/web/generated/property_mobile/key_now_2.webp', '/web/generated/property_mobile/key_now_2.png'],
  ['/web/generated/property_mobile/key_now_3.webp', '/web/generated/property_mobile/key_now_3.png'],
  ['/web/generated/property_mobile/key_past_1.webp', '/web/generated/property_mobile/key_past_1.png'],
  ['/web/generated/property_mobile/key_past_2.webp', '/web/generated/property_mobile/key_past_2.png'],
  ['/web/generated/property_mobile/key_past_3.webp', '/web/generated/property_mobile/key_past_3.png'],
  ['/web/generated/property_mobile/bag_now.png', '/property/bag_now/ChatGPT%20Image%202026%E5%B9%B46%E6%9C%8820%E6%97%A5%2018_48_49.png'],
  ['/web/generated/property_mobile/bag_past.png', '/property/bag_past/ChatGPT%20Image%202026%E5%B9%B46%E6%9C%8820%E6%97%A5%2018_44_38.png'],
  ['/web/generated/property_mobile/mail_now.png', '/property/mail_now/ChatGPT%20Image%202026%E5%B9%B46%E6%9C%8820%E6%97%A5%2018_40_25%20(4).png'],
  ['/web/generated/property_mobile/mail_past.png', '/property/mail_past/ChatGPT%20Image%202026%E5%B9%B46%E6%9C%8820%E6%97%A5%2018_42_34%20(4).png'],
  ['/web/generated/property_mobile/key_now_1.png', '/property/key_now/1.png'],
  ['/web/generated/property_mobile/key_now_2.png', '/property/key_now/2.png'],
  ['/web/generated/property_mobile/key_now_3.png', '/property/key_now/3.png'],
  ['/web/generated/property_mobile/key_past_1.png', '/property/key_past/1.png'],
  ['/web/generated/property_mobile/key_past_2.png', '/property/key_past/2.png'],
  ['/web/generated/property_mobile/key_past_3.png', '/property/key_past/3.png'],
]);

const schoolSortTiles = {
  letter: optimizedImage('/web/generated/school_mobile/letter.webp', '/web/generated/school_mobile/letter.jpg'),
  cry: optimizedImage('/web/generated/school_mobile/cry.webp', '/web/generated/school_mobile/cry.jpg'),
  hug: optimizedImage('/web/generated/school_mobile/hug.webp', '/web/generated/school_mobile/hug.jpg'),
  ride: optimizedImage('/web/generated/school_mobile/ride.webp', '/web/generated/school_mobile/ride.jpg'),
};
const schoolSortBoardImage = optimizedImage('/web/generated/school_mobile/sort-board.webp', '/web/generated/school_mobile/board.jpg');

const schoolSortAnswer = ['letter', 'cry', 'hug', 'ride'];

function optimizedImage(src, fallback) {
  return { src, fallback };
}

const uiAssetBase = '/web/generated/ui_mobile';
const uiAssets = {
  mailIcon: `${uiAssetBase}/mail-icon.png`,
  memory1Icon: `${uiAssetBase}/memory-1-icon.png`,
  memory2Icon: `${uiAssetBase}/memory-2-icon.png`,
  pauseButton: `${uiAssetBase}/pause-button.png`,
  settingsButton: `${uiAssetBase}/settings-button.png`,
  cameraButton: `${uiAssetBase}/camera-button.png`,
  skipButton: `${uiAssetBase}/skip-button.png`,
  paperclip: `${uiAssetBase}/paperclip.png`,
  taskToastPanel: `${uiAssetBase}/task-toast-panel.png`,
  dialogPanel: `${uiAssetBase}/dialog-panel.png`,
  letterGrandpa: `${uiAssetBase}/letter-grandpa.png`,
  memory1Card: `${uiAssetBase}/memory-1-card.png`,
  memory21Card: `${uiAssetBase}/memory-2-1-card.png`,
  memory22Card: `${uiAssetBase}/memory-2-2-card.png`,
  memory23Card: `${uiAssetBase}/memory-2-3-card.png`,
  // Full-screen art rasterized from the UI/*.svg design exports (see scripts/rasterize-ui-art.mjs)
  loadingArt: `${uiAssetBase}/loading-art.webp`,
  endingArt: [`${uiAssetBase}/ending-1.webp`, `${uiAssetBase}/ending-2.webp`],
  motionGuide: [
    `${uiAssetBase}/guide-1.webp`,
    `${uiAssetBase}/guide-2.webp`,
    `${uiAssetBase}/guide-3.webp`,
    `${uiAssetBase}/guide-4.webp`,
  ],
};

const storyCopy = {
  tasks: {
    level1: ['关卡一', '路口重逢：走到爷爷身旁，点击与他交谈'],
    level2: ['关卡二', '邮箱：找到2号信箱，替爷爷投信'],
    level3: ['关卡三', '记忆拼图：拼回散落的旧明信片'],
    level4: ['关卡四', '牵着爷爷一起走回家：到家门口擦净信封、读信并签收（别走太快，等等他）'],
    epilogue: ['结语', '这封信，终于送到了'],
  },
  dialogs: {
    intro: [
      ['爷爷', '还有一封信。今天得送到。'],
      ['小满', '爷爷，我陪您走。慢慢来。'],
    ],
    holdGrandpa: [
      ['爷爷', '新来的投递员？来，帮我看着路。'],
      ['小满', '好。今天我做您的搭档。'],
      ['爷爷', '2号信箱，四点半。钥匙一响，小满就笑。'],
    ],
    mailboxDone: [
      ['爷爷', '咔哒。听见没？就是这个声。'],
      ['小满（心里）', '他忘了回家的路，还记得信箱的声音。'],
      ['小满', '下一站，去学校。'],
    ],
    memoryDone: [
      ['小满', '爷爷，我想起来了。那天是您来接我。'],
      ['爷爷', '小满回来了？那走，爷爷带你回家。'],
      ['小满（心里）', '他不是不认识我。他只是困在很远的一天。'],
    ],
    deliveryDone: [
      ['爷爷', '满啊，爷爷记性不好，你别怪我。'],
      ['爷爷', '这封信写给小满。今天总算送到。'],
      ['小满', '爷爷，这封信我签收了。'],
      ['爷爷', '签收了就好。回家吧。'],
    ],
    listenStory: [
      ['爷爷', '小满放学，就在信箱旁边等我。'],
      ['爷爷', '她说，走路要像盖邮戳，一步一个印。'],
      ['爷爷', '咔哒。四点半，她最爱听这一声。'],
    ],
    // 关卡四：牵着爷爷走回家时，爷爷在路上说的零碎话（非阻塞气泡 + 随机对话音）。
    companion: {
      slowDown: ['等等我。', '你慢一点。', '别走那么快。', '慢些走，我跟不上喽。'],
      calls: ['你去哪儿了？', '回来一下。', '别把我一个人丢在这。', '满啊，等等我……'],
      chats: [
        '这条路，我走了好多年。',
        '小满以前就在这儿等我。',
        '不急，慢慢走。',
        '你看，小卖部还在。',
      ],
      reunion: ['哎，你可回来了。', '别走丢了，跟着爷爷。'],
      // 引导：目标切换时爷爷指路的零碎话（非阻塞气泡 + 对话音），让爷爷在引路时多说话。
      guide: {
        mailbox: ['先去2号信箱，钥匙一响，小满就笑。', '跟着我，去信箱那边。', '信得送到，咱们走。'],
        school: ['这回往学校走，小满还在那儿等。', '校门口，老地方，咱们去。', '慢些走，往学校那条路。'],
        home: ['走，爷爷带你回家。', '到家门口就好了，别走太快。', '回家的路，我认得，跟着我。'],
      },
    },
  },
  memories: [
    { src: uiAssets.memory1Card, caption: '记忆碎片一：老宿舍区的信箱，爷爷总能找到每一户。' },
    { src: uiAssets.memory21Card, caption: '记忆碎片二：校门口，爷爷在雨里等小满放学。' },
    { src: uiAssets.memory22Card, caption: '记忆碎片二：哭过以后，爷爷递来一封没有寄出的信。' },
    { src: uiAssets.memory23Card, caption: '记忆碎片二：回家的路上，车铃声和夕阳一起响。' },
  ],
  // 结语为两张海报(结语1/2.png)，文案已全部烤进图里；这里只保留每步按钮文字。
  // HTML 的 kicker/title/text 不再叠加显示（见 renderEndingStep），避免与海报重复。
  ending: [
    { button: '继续' },
    { button: '回到开头' },
  ],
};

const mailboxTaskState = {
  timeline: 'now',
  panelOpen: false,
  hasMailKey: false,
  completed: false,
  inRange: false,
};

const schoolTaskState = {
  panelOpen: false,
  completed: false,
  selectedTile: null,
  placements: Array(schoolSortAnswer.length).fill(null),
  inRange: false,
};

const listenTaskState = {
  active: false,
  holding: false,
  progress: 0,
  timer: 0,
  completed: false,
};
const listenDurationMs = 6000;

const homeTaskState = {
  panelOpen: false,
  completed: false,
  inRange: false,
  deliveryStage: DELIVERY_STAGE.scratch,
  scratchProgress: 0,
  scratchComplete: false,
  letterOpen: false,
  signed: false,
};

const gameUiState = {
  started: false,
  sceneReady: false,
  pausedByUi: false,
  level1Complete: false,
  grandpaLeading: false,
  dialogLines: [],
  dialogIndex: 0,
  unlockedMemoryCount: 0,
  activeMemoryIndex: 0,
  endingIndex: 0,
  pendingDialog: null,
  signatureDrawing: false,
  scratchDrawing: false,
  lastScratchPoint: null,
  lastSignaturePoint: null,
};

const grandpaInteraction = {
  pickDistance: 24,
  autoWalkSpeed: 1.8,
  followSpeed: 5.4,
  followAheadOffset: 2.7, // 爷爷站玩家侧前方（第一人称里看得见），不再藏在身后
  followSideOffset: -1.15, // 偏右一点，不挡正前方的路与任务目标
  followComfort: 2.15, // 舒适跟随距离：超过才开始灰度压力/提醒
  holdBreakDistance: 6.2,
  rejoinDistance: 4.8,
};

const grandpaState = {
  autoWalking: true,
  held: false,
  lost: false,
  linked: false,
  holdPointerId: null,
  suppressNextCanvasClick: false,
  moving: false,
  statusMessage: '',
};

const materialCache = new Map();
const grandpaTextureCache = new Map();
const skyTextureCache = new Map();
const debugMarkerStorageKey = 'last-letter-space-markers-v1';
const playerCollider = new Capsule(
  new THREE.Vector3(),
  new THREE.Vector3(),
  firstPersonPreview.collisionRadius,
);
const debugMarkers = [];
const debugRaycaster = new THREE.Raycaster();
const labelOcclusionRaycaster = new THREE.Raycaster(); // 地点气泡被建筑遮挡时隐藏
const labelOcclusionDir = new THREE.Vector3();
let labelOcclusionFrame = 0;
const debugPointer = new THREE.Vector2();
const debugPointerDown = new THREE.Vector2();
const mailboxRaycaster = new THREE.Raycaster();
const mailboxPointer = new THREE.Vector2();
const schoolRaycaster = new THREE.Raycaster();
const schoolPointer = new THREE.Vector2();
const homeRaycaster = new THREE.Raycaster();
const homePointer = new THREE.Vector2();
const grandpaRaycaster = new THREE.Raycaster();
const grandpaPointer = new THREE.Vector2();
let debugActive = false;
let debugNextMarkerId = 1;
const inkLineMaterial = new THREE.LineBasicMaterial({
  color: 0x11100d,
  transparent: true,
  opacity: 0.9,
  depthTest: true,
});
const outlineObjects = [];
let worldRoot;
let lodRoot;
let grandpaRoot;
const grandpaRig = {
  parts: {},
  meshes: [],
  materials: {},
  phase: 0,
  walkBlend: 0,
};
// 双时期爷爷模型（正常 / 风格化），跟随渲染模式切换。动画从简：
// idle/walk 两个 GLB 各自循环播放，按 grandpaState.moving 切显哪一个。
// 加载失败时回退到 createGrandpaCharacter 的程序化爷爷。
const grandpaModel = {
  enabled: false,
  periods: {}, // { normal:{group,idle,walk}, stylized:{group,idle,walk} }
  active: 'normal',
  targetHeight: 1.82, // 目标世界身高（略低于玩家眼高，老人微驼）
  facingOffset: 0, // 模型前向修正（验收时按真机表现微调）
  sources: {
    normal: {
      idle: '/web/generated/grandpa/normal-idle.glb',
      walk: '/web/generated/grandpa/normal-walk.glb',
    },
    stylized: {
      idle: '/web/generated/grandpa/stylized-idle.glb',
      walk: '/web/generated/grandpa/stylized-walk.glb',
    },
  },
};
let routeSegments = [];
let locationLabels = [];
let pendingConversation = null;
const grandpaTalkRadius = 9;
let modeRevertTimer = 0;
let modeSwapTimer = 0;
let companionStress = 0;
let companionStressTarget = 0;
let grandpaLeadStartedAt = 0;
let grandpaLeadWalkStartedAt = 0;
const grandpaLeadCameraDistance = 4.2;

// 全程"牵着爷爷一起走"陪伴机制状态（落后提醒 / 路上停说 / 抛下呼喊 / 回归）。
// 从关卡一牵手起激活，贯穿邮局→学校→回家，不再只在关卡四。
const level4State = {
  active: false,
  remindAt: 0, // 落后提醒节流（ms 时间戳）
  callAt: 0, // 抛下呼喊节流
  talkAt: 0, // 下次"停下来说话"触发时间
  talking: false, // 爷爷正停下说话
  talkUntil: 0,
  talkAnchor: { x: 0, z: 0 }, // 开始说话时玩家位置，用于判定"走开=抛下"
  remindIndex: -1,
  callIndex: -1,
  talkIndex: -1,
  guideIndex: -1,
};
const level4HoldBreakDistance = 6.6; // 关卡四专用断裂距离：快走会真正拉断牵手
let grandpaSayTimer = 0;
let lastGuidedObjectiveKey = null; // 目标指路气泡去重：只在目标真正切换时让爷爷开口
const grandpaLeadMaxMs = 14000;
let mailboxHotspot;
let schoolHotspot;
let homeHotspot;
let worldCollisionRoot;
let worldCollisionOctree;
let worldCollisionStats = {
  loaded: false,
  blockers: 0,
  triangles: 0,
};
let lodSceneStats = {
  loaded: false,
  visible: false,
  meshes: 0,
};
let mode = 'texture';

function configureRenderQuality() {
  const deviceDpr = window.devicePixelRatio || 1;
  const dprCap = runtimeConfig.quality === 'lite' ? 1 : 1.5;
  runtimeConfig.dpr = Math.min(deviceDpr, dprCap);
  runtimeConfig.composerDpr = runtimeConfig.dpr;
  runtimeConfig.outlineEnabled = runtimeConfig.quality !== 'lite';
}

function exposePerformanceDebug() {
  window.__performanceDebug = {
    getState: () => ({
      quality: runtimeConfig.quality,
      sceneVariant: runtimeConfig.sceneVariant,
      classicRender: runtimeConfig.classicRender,
      controls: mobileInput.mode,
      requestedControls: runtimeConfig.requestedControls,
      isMobile: runtimeConfig.isMobile,
      dpr: runtimeConfig.dpr,
      composerDpr: runtimeConfig.composerDpr,
      outlineEnabled: runtimeConfig.outlineEnabled,
      fps: Math.round(performanceStats.fps),
      sceneLoadMs: Math.round(performanceStats.sceneLoadMs),
      collisionLoadMs: Math.round(performanceStats.collisionLoadMs),
      grandpaLoadMs: Math.round(performanceStats.grandpaLoadMs),
      lodLoadMs: Math.round(performanceStats.lodLoadMs),
      sensorPermission: mobileInput.sensorPermission,
      sensorListening: mobileInput.sensorListening,
      sensorSamples: mobileInput.motionSampleCount,
      sensorLastMotionMsAgo: mobileInput.lastMotionAt
        ? Math.round(performance.now() - mobileInput.lastMotionAt)
        : null,
      paused: performanceStats.paused,
      contextLost: performanceStats.contextLost,
      collision: { ...worldCollisionStats },
      lod: { ...lodSceneStats },
    }),
  };
}

applySky(mode);
applyLighting(mode);
preloadCloudAssets();
initSpaceDebug();
initFirstPersonControls();
initMobileControls();
initMailboxQuest();
initSchoolQuest();
initListenTask();
initGameUi();
initLifecycleHandlers();
exposePerformanceDebug();

function materialKey(name, sourceMaterial, activeMode, variant = '') {
  return [
    activeMode,
    name,
    variant,
    sourceMaterial?.uuid,
    sourceMaterial?.map?.uuid,
    sourceMaterial?.emissiveMap?.uuid,
  ].join(':');
}

function classify(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('sky')) return 'sky';
  if (lower.includes('coldground') || lower.includes('ground')) return 'ground';
  if (lower.includes('sidewalk')) return 'sidewalk';
  if (lower.includes('road_markings')) return 'roadMarking';
  if (lower.includes('road_sign')) return 'sign';
  if (lower.includes('road_fencing') || lower.includes('road_hatches')) return 'metal';
  if (lower.includes('road') || lower.includes('track')) return 'road';
  if (lower.includes('tile_floor') || lower.includes('wood_floor') || lower.includes('tiles_small') || lower.includes('floor')) return 'floor';
  if (lower.includes('wall') || lower.includes('building') || lower.includes('concrete') || lower.includes('brick')) return 'wall';
  if (lower.includes('roof')) return 'roof';
  if (lower.includes('wood') || lower.includes('board')) return 'wood';
  if (lower.includes('foliage') || lower.includes('bush') || lower.includes('tree')) return 'foliage';
  if (lower.includes('sign') || lower.includes('poster') || lower.includes('showcase') || lower.includes('led')) return 'sign';
  if (lower.includes('lamp') || lower.includes('window') || lower.includes('door')) return 'memory';
  if (lower.includes('pipe') || lower.includes('cable') || lower.includes('fence') || lower.includes('conditioner')) return 'metal';
  if (lower.includes('clothes') || lower.includes('grandpa')) return 'grandpaCoat';
  return 'prop';
}

function isSkyObject(object) {
  const names = [object.name];
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    names.push(material?.name);
  }

  return names.some((name) => classify(name) === 'sky');
}

function neutralizeImportedSky(root) {
  root?.traverse((object) => {
    if (!isSkyObject(object)) {
      return;
    }
    object.visible = false;
    object.userData.skipStylize = true;
    object.userData.excludeFromBounds = true;
    object.userData.importedSkyHidden = true;
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0;
        material.depthWrite = false;
      });
    }
  });
}

function makeToonMaterial(sourceMaterial, activeMode, object, materialIndex = 0) {
  const name = sourceMaterial?.name ?? 'material';
  const grandpaSurface = isGrandpaObject(object, sourceMaterial);
  if (grandpaSurface) {
    return makeGrandpaToonMaterial(sourceMaterial, activeMode, object, materialIndex);
  }

  const windowStyle = nightWindowStyleForObject(object, sourceMaterial, activeMode, materialIndex);
  const decalSurface = isDecalSurface(object, sourceMaterial);
  const materialVariant = [
    windowStyle?.variant,
    decalSurface ? 'decal-overlay' : '',
  ].filter(Boolean).join('|');
  const key = materialKey(name, sourceMaterial, activeMode, materialVariant);
  if (materialCache.has(key)) {
    return materialCache.get(key);
  }

  const category = classify(name);
  const lampSurface = isLampSurface(object, sourceMaterial);
  const colorCategory = lampSurface && activeMode !== 'night' ? 'metal' : category;
  const useTexture = activeMode === 'texture' && sourceMaterial?.map;
  const color = new THREE.Color(windowStyle?.color ?? colorForMode(colorCategory, activeMode));

  if (windowStyle?.vertexColors) {
    const material = new THREE.MeshBasicMaterial({
      name: `${name}_${activeMode}_windowGrid`,
      color,
      vertexColors: true,
      transparent: sourceMaterial?.transparent ?? false,
      opacity: sourceMaterial?.opacity ?? 1,
      alphaTest: sourceMaterial?.alphaTest ?? 0,
      side: sourceMaterial?.side ?? THREE.FrontSide,
      toneMapped: false,
    });

    applyDecalMaterialSettings(material, decalSurface);
    materialCache.set(key, material);
    return material;
  }

  if (category === 'roadMarking') {
    const material = new THREE.MeshBasicMaterial({
      name: `${name}_${activeMode}`,
      color,
      map: useTexture ? sourceMaterial.map : null,
      transparent: sourceMaterial?.transparent ?? false,
      opacity: sourceMaterial?.opacity ?? 1,
      alphaTest: sourceMaterial?.alphaTest ?? 0,
      side: sourceMaterial?.side ?? THREE.FrontSide,
      toneMapped: false,
    });

    applyDecalMaterialSettings(material, decalSurface);
    materialCache.set(key, material);
    return material;
  }

  const material = new THREE.MeshToonMaterial({
    name: `${name}_${activeMode}`,
    color,
    map: useTexture ? sourceMaterial.map : null,
    gradientMap: toonGradient,
    transparent: sourceMaterial?.transparent ?? false,
    opacity: sourceMaterial?.opacity ?? 1,
    alphaTest: sourceMaterial?.alphaTest ?? 0,
    side: sourceMaterial?.side ?? THREE.FrontSide,
  });

  if (windowStyle) {
    material.emissive = new THREE.Color(windowStyle.emissive);
    material.emissiveIntensity = windowStyle.emissiveIntensity;
    material.emissiveMap = null;
  } else if (!lampSurface && (sourceMaterial?.emissiveMap || category === 'memory' || (activeMode === 'night' && isNightGlowCategory(category)))) {
    material.emissive = new THREE.Color(emissiveColorForMode(category, activeMode));
    material.emissiveIntensity = emissiveIntensityForMode(category, activeMode);
    material.emissiveMap = activeMode === 'texture' ? sourceMaterial.emissiveMap : null;
  } else if (lampSurface && activeMode === 'night') {
    material.emissive = new THREE.Color(0xffbd55);
    material.emissiveIntensity = 0.9;
    material.emissiveMap = null;
  }

  applyDecalMaterialSettings(material, decalSurface);
  materialCache.set(key, material);
  return material;
}

function makeGrandpaToonMaterial(sourceMaterial, activeMode, object, materialIndex = 0) {
  const name = sourceMaterial?.name ?? object?.name ?? 'grandpa';
  const key = materialKey(name, sourceMaterial, activeMode, `grandpa:${materialIndex}`);
  if (materialCache.has(key)) {
    return materialCache.get(key);
  }

  const material = new THREE.MeshToonMaterial({
    name: `${name}_${activeMode}_grandpa`,
    color: grandpaMaterialTint(activeMode),
    map: sourceMaterial?.map ? stylizeGrandpaTexture(sourceMaterial.map, activeMode) : null,
    gradientMap: toonGradient,
    transparent: sourceMaterial?.transparent ?? false,
    opacity: sourceMaterial?.opacity ?? 1,
    alphaTest: sourceMaterial?.alphaTest ?? 0,
    side: sourceMaterial?.side ?? THREE.FrontSide,
  });

  if (activeMode === 'night') {
    material.emissive = new THREE.Color(0x172235);
    material.emissiveIntensity = 0.08;
  }

  materialCache.set(key, material);
  return material;
}

function grandpaMaterialTint(activeMode) {
  if (activeMode === 'memory') return new THREE.Color(0xffddb0);
  if (activeMode === 'night') return new THREE.Color(0xc7d4df);
  return new THREE.Color(0xffffff);
}

function isGrandpaObject(object, sourceMaterial) {
  let cursor = object;
  while (cursor) {
    const name = (cursor.name ?? '').toLowerCase();
    if (name.includes('grandpa') || name.includes('爷爷')) {
      return true;
    }
    cursor = cursor.parent;
  }

  const materialText = [
    sourceMaterial?.name,
    sourceMaterial?.map?.name,
    sourceMaterial?.map?.source?.data?.name,
  ].filter(Boolean).join(' ').toLowerCase();
  return materialText.includes('grandpa') || materialText.includes('爷爷');
}

function stylizeGrandpaTexture(sourceTexture, activeMode) {
  const key = `${sourceTexture.uuid}:${activeMode}`;
  if (grandpaTextureCache.has(key)) {
    return grandpaTextureCache.get(key);
  }

  const image = sourceTexture.image;
  const width = image?.naturalWidth ?? image?.videoWidth ?? image?.width;
  const height = image?.naturalHeight ?? image?.videoHeight ?? image?.height;
  if (!image || !width || !height) {
    return sourceTexture;
  }

  try {
    const maxTextureSize = grandpaPreview.textureMaxSize;
    const scale = Math.min(1, maxTextureSize / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    posterizeGrandpaPixels(imageData.data, activeMode);
    ctx.putImageData(imageData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${sourceTexture.name || 'grandpa'}_${activeMode}_stylized`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = sourceTexture.flipY;
    texture.wrapS = sourceTexture.wrapS;
    texture.wrapT = sourceTexture.wrapT;
    texture.offset.copy(sourceTexture.offset);
    texture.repeat.copy(sourceTexture.repeat);
    texture.center.copy(sourceTexture.center);
    texture.rotation = sourceTexture.rotation;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;

    grandpaTextureCache.set(key, texture);
    return texture;
  } catch (error) {
    console.warn('Grandpa texture stylize failed', error);
    return sourceTexture;
  }
}

function posterizeGrandpaPixels(data, activeMode) {
  const profile = grandpaColorProfiles[activeMode] ?? grandpaColorProfiles.palette;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) {
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hsl = rgbToHsl(r, g, b);
    const surface = classifyGrandpaPixel(r, g, b, hsl);
    const color = pickGrandpaColor(profile, surface, hsl.l);

    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
  }
}

function classifyGrandpaPixel(r, g, b, hsl) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const h = hsl.h;
  const s = hsl.s;
  const l = hsl.l;

  if (max < 34 || l < 0.08) {
    return 'dark';
  }

  if (h >= 12 && h <= 50 && s > 0.18 && l > 0.28 && r > g * 1.04 && r > b * 1.16) {
    return 'skin';
  }

  if (s < 0.18 && l > 0.62 && max - min < 58) {
    return 'hair';
  }

  if (h >= 55 && h <= 150 && s > 0.08 && g >= r * 0.86) {
    return 'green';
  }

  if (h >= 12 && h <= 58 && s > 0.14 && l < 0.46) {
    return 'leather';
  }

  if (l < 0.19) {
    return 'dark';
  }

  return 'fabric';
}

function pickGrandpaColor(profile, surface, lightness) {
  const ramp = profile[surface] ?? profile.fabric;
  if (surface === 'dark') {
    return hexToRgb(lightness < 0.12 ? ramp[0] : ramp[1]);
  }

  if (surface === 'skin') {
    if (lightness < 0.38) return hexToRgb(ramp[0]);
    if (lightness > 0.68) return hexToRgb(ramp[2]);
    return hexToRgb(ramp[1]);
  }

  if (surface === 'hair') {
    if (lightness < 0.7) return hexToRgb(ramp[0]);
    if (lightness > 0.84) return hexToRgb(ramp[2]);
    return hexToRgb(ramp[1]);
  }

  if (lightness < 0.32) return hexToRgb(ramp[0]);
  if (lightness > 0.58) return hexToRgb(ramp[2]);
  return hexToRgb(ramp[1]);
}

function rgbToHsl(r, g, b) {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h;
  if (max === nr) {
    h = (ng - nb) / delta + (ng < nb ? 6 : 0);
  } else if (max === ng) {
    h = (nb - nr) / delta + 2;
  } else {
    h = (nr - ng) / delta + 4;
  }

  return { h: h * 60, s, l };
}

function hexToRgb(hex) {
  const color = new THREE.Color(hex);
  return [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
  ];
}

function nightWindowStyleForObject(object, sourceMaterial, activeMode, materialIndex) {
  if (activeMode !== 'night' || !isWindowSurface(object, sourceMaterial)) {
    return null;
  }

  return {
    variant: `window-grid:${sourceMaterial?.uuid ?? sourceMaterial?.name}:${materialIndex}`,
    color: '#ffffff',
    emissive: 0x000000,
    emissiveIntensity: 0,
    vertexColors: true,
  };
}

function isWindowSurface(object, sourceMaterial) {
  return surfaceNameText(object, sourceMaterial).includes('window');
}

function isLampSurface(object, sourceMaterial) {
  const text = surfaceNameText(object, sourceMaterial);
  return text.includes('lamppost') || text.includes('flashlight');
}

function isDecalSurface(object, sourceMaterial) {
  const text = surfaceNameText(object, sourceMaterial);
  return text.includes('decal') || text.includes('graffiti');
}

function applyDecalMaterialSettings(material, decalSurface) {
  if (!decalSurface) {
    return;
  }

  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -4;
  material.polygonOffsetUnits = -4;
  material.side = THREE.DoubleSide;
  material.toneMapped = false;
}

function surfaceNameText(object, sourceMaterial) {
  return [
    object?.name,
    object?.parent?.name,
    sourceMaterial?.name,
    sourceMaterial?.map?.name,
    sourceMaterial?.map?.source?.data?.name,
  ].filter(Boolean).join(' ').toLowerCase();
}

function colorForMode(category, activeMode) {
  if (activeMode === 'memory') return warmMemoryColor(category);
  if (activeMode === 'night') return nightColor(category);
  return palette[category];
}

function warmMemoryColor(category) {
  if (category === 'sky') return '#ffd88a';
  if (category === 'ground') return '#caa967';
  if (category === 'road') return '#4e3f36';
  if (category === 'roadMarking') return '#fff4cd';
  if (category === 'sidewalk') return '#f1dfa9';
  if (category === 'floor') return '#e1c87d';
  if (category === 'wall') return '#fff0bd';
  if (category === 'foliage') return '#9a9456';
  if (category === 'roof') return '#9b613f';
  if (category === 'metal') return '#b5a06f';
  return palette.memory;
}

function nightColor(category) {
  return nightPalette[category] ?? nightPalette.prop;
}

function isNightGlowCategory(category) {
  return category === 'memory' || category === 'sign' || category === 'roadMarking';
}

function emissiveColorForMode(category, activeMode) {
  if (activeMode === 'night') {
    if (category === 'roadMarking') return 0xfff0be;
    if (category === 'sign') return 0xffbd52;
    return 0xffc15c;
  }

  return activeMode === 'palette' ? 0xf0a12a : 0xffb43d;
}

function emissiveIntensityForMode(category, activeMode) {
  if (activeMode === 'night') {
    if (category === 'roadMarking') return 0.28;
    if (category === 'sign') return 0.9;
    return 0.82;
  }

  return category === 'memory' ? 0.55 : 0.35;
}

function applySky(activeMode) {
  const skyColor = activeMode === 'memory'
    ? '#ffd88a'
    : activeMode === 'night'
      ? nightPalette.sky
      : palette.sky;
  scene.background = createSkyTexture(activeMode);
  scene.fog.color.set(skyColor);
  renderer.setClearColor(skyColor, 1);
}

function preloadCloudAssets() {
  Promise.all(cloudSources.map((src, index) => new Promise((resolve) => {
    textureLoader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      cloudTextures[index] = texture;
      resolve(true);
    }, undefined, () => resolve(false));
  }))).then(() => {
    cloudAssetsReady = cloudTextures.some(Boolean);
    if (cloudAssetsReady) {
      updateWorldClouds(worldRoot, mode);
    }
  });
}

function applyLighting(activeMode) {
  const profile = lightingProfileForMode(activeMode);
  rimLight.position.set(-180, 210, -120);
  outlinePass.enabled = runtimeConfig.outlineEnabled;

  if (activeMode === 'night') {
    sun.color.set(profile.sunColor);
    sun.intensity = profile.sunIntensity;
    fill.color.set(profile.fillColor);
    fill.groundColor.set(profile.groundColor);
    fill.intensity = profile.fillIntensity;
    nightGlow.intensity = 1.6;
    rimLight.color.set(profile.rimColor);
    rimLight.intensity = profile.rimIntensity;
    outlinePass.edgeStrength = 1.32;
    outlinePass.edgeThickness = 0.72;
    inkLineMaterial.color.set(0x090e17);
    inkLineMaterial.opacity = 0.94;
    return;
  }

  sun.color.set(profile.sunColor);
  sun.intensity = profile.sunIntensity;
  fill.color.set(profile.fillColor);
  fill.groundColor.set(profile.groundColor);
  fill.intensity = profile.fillIntensity;
  nightGlow.intensity = 0;
  rimLight.color.set(profile.rimColor);
  rimLight.intensity = profile.rimIntensity;
  inkLineMaterial.color.set(0x11100d);
  inkLineMaterial.opacity = 0.9;

  if (activeMode === 'memory') {
    outlinePass.edgeStrength = 1.1;
    outlinePass.edgeThickness = 0.62;
    return;
  }

  outlinePass.edgeStrength = 1.15;
  outlinePass.edgeThickness = 0.65;
}

function lightingProfileForMode(activeMode) {
  if (activeMode === 'memory') {
    return {
      time: '17:00',
      sunOffset: new THREE.Vector3(1.18, 0.38, -0.7),
      sunColor: 0xffb765,
      sunIntensity: 2.15,
      fillColor: 0xffd6a0,
      groundColor: 0x9b6240,
      fillIntensity: 1.55,
      rimColor: 0xffddb0,
      rimIntensity: 0.34,
    };
  }

  if (activeMode === 'night') {
    return {
      time: '20:00',
      sunOffset: new THREE.Vector3(-0.62, 0.52, -0.92),
      sunColor: 0x9fc8ff,
      sunIntensity: 0.62,
      fillColor: 0x789bab,
      groundColor: 0x152131,
      fillIntensity: 1.08,
      rimColor: 0xd6e9ff,
      rimIntensity: 0.48,
    };
  }

  return {
    time: '15:00',
    sunOffset: new THREE.Vector3(0.96, 0.72, 0.42),
    sunColor: 0xffefbd,
    sunIntensity: 2.3,
    fillColor: 0xd8fff7,
    groundColor: 0xffd78b,
    fillIntensity: 1.62,
    rimColor: 0xd9f7ff,
    rimIntensity: 0.22,
  };
}

function createSkyTexture(activeMode) {
  if (skyTextureCache.has(activeMode)) {
    return skyTextureCache.get(activeMode);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const isWarm = activeMode === 'memory';
  const isNight = activeMode === 'night';

  if (isNight) {
    ctx.fillStyle = '#18233d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#223b54';
    ctx.fillRect(0, 185, canvas.width, 327);
    ctx.fillStyle = '#305661';
    ctx.fillRect(0, 382, canvas.width, 130);

    drawStars(ctx);
    drawMoon(ctx, 810, 92, 52);
  } else {
    ctx.fillStyle = isWarm ? '#ffd88a' : '#b8e2df';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = isWarm ? '#ffe6a9' : '#cdebe5';
    ctx.fillRect(0, 210, canvas.width, 302);
    ctx.fillStyle = isWarm ? '#fff1c8' : '#e0f3eb';
    ctx.fillRect(0, 390, canvas.width, 122);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  skyTextureCache.set(activeMode, texture);
  return texture;
}

function updateWorldClouds(root, activeMode) {
  clearWorldClouds();
  if (!root || !cloudAssetsReady) {
    return;
  }

  const layouts = activeMode === 'night' ? WORLD_CLOUD_LAYOUTS.night : WORLD_CLOUD_LAYOUTS.day;

  for (const layout of layouts) {
    addWorldCloud(layout, activeMode);
  }
}

function clearWorldClouds() {
  for (const child of cloudGroup.children) {
    child.material?.dispose();
  }
  cloudGroup.clear();
}

function addWorldCloud(layout, activeMode) {
  const texture = cloudTextures[layout.asset % cloudTextures.length];
  if (!texture) {
    return;
  }

  const color = activeMode === 'night'
    ? 0xbfd2d0
    : activeMode === 'memory'
      ? 0xffefd1
      : 0xffffff;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: layout.opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const cloud = new THREE.Sprite(material);
  cloud.name = 'WorldCloud';
  cloud.userData.skipStylize = true;
  cloud.userData.excludeFromBounds = true;
  cloud.renderOrder = -1;
  cloud.position.set(layout.x, layout.y, layout.z);

  const width = THREE.MathUtils.clamp(layout.width, 16, 62);
  const aspect = texture.image?.height && texture.image?.width
    ? texture.image.height / texture.image.width
    : 0.38;
  cloud.scale.set(width, width * aspect, 1);
  cloudGroup.add(cloud);
}

function drawStars(ctx) {
  const rng = seededRandom(920620);
  ctx.save();
  ctx.fillStyle = '#fff2ba';
  for (let i = 0; i < 74; i += 1) {
    const x = rng() * 1024;
    const y = 18 + rng() * 220;
    const size = rng() > 0.86 ? 2.4 : 1.2 + rng() * 1.2;
    ctx.globalAlpha = 0.35 + rng() * 0.55;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawMoon(ctx, x, y, radius) {
  ctx.save();
  ctx.fillStyle = '#fff3c7';
  ctx.strokeStyle = 'rgba(7, 12, 23, 0.62)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#18233d';
  ctx.beginPath();
  ctx.arc(x + 24, y - 8, radius * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function stylizeObject(root, activeMode) {
  const rootOutlineObjects = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.userData.skipStylize || object.parent?.userData.skipStylize) return;

    if (isSkyObject(object)) {
      object.visible = false;
      return;
    }

    object.frustumCulled = true;
    object.userData.sourceMaterial ??= Array.isArray(object.material)
      ? [...object.material]
      : object.material;
    const sourceMaterials = Array.isArray(object.userData.sourceMaterial)
      ? object.userData.sourceMaterial
      : [object.userData.sourceMaterial];
    const decalSurface = sourceMaterials.some((material) => isDecalSurface(object, material));

    object.userData.sourceRenderOrder ??= object.renderOrder;
    object.renderOrder = decalSurface
      ? Math.max(object.userData.sourceRenderOrder, 6)
      : object.userData.sourceRenderOrder;

    applyNightWindowGeometry(object, sourceMaterials, activeMode);

    if (Array.isArray(object.userData.sourceMaterial)) {
      object.material = object.userData.sourceMaterial.map((mat, index) => makeToonMaterial(mat, activeMode, object, index));
    } else {
      object.material = makeToonMaterial(object.userData.sourceMaterial, activeMode, object, 0);
    }

    if (!decalSurface && object.geometry?.attributes?.normal) {
      rootOutlineObjects.push(object);
    }

    if (decalSurface) {
      removeInkLines(object);
    } else {
      addInkLines(object);
    }
  });

  root.userData.outlineObjects = rootOutlineObjects;
  syncOutlineObjects();
}

function syncOutlineObjects() {
  outlineObjects.length = 0;
  if (worldRoot?.userData.outlineObjects) {
    outlineObjects.push(...worldRoot.userData.outlineObjects);
  }
  if (grandpaRoot?.userData.outlineObjects) {
    outlineObjects.push(...grandpaRoot.userData.outlineObjects);
  }
  outlinePass.selectedObjects = outlineObjects;
}

function applyNightWindowGeometry(object, sourceMaterials, activeMode) {
  object.userData.sourceGeometry ??= object.geometry;
  const hasWindowMaterial = sourceMaterials.some((material) => isWindowSurface(object, material));

  if (activeMode !== 'night' || !hasWindowMaterial) {
    object.geometry = object.userData.sourceGeometry;
    return;
  }

  if (!object.userData.nightWindowGeometry) {
    const geometry = object.userData.sourceGeometry.index
      ? object.userData.sourceGeometry.toNonIndexed()
      : object.userData.sourceGeometry.clone();
    paintNightWindowVertexColors(geometry, object, sourceMaterials);
    object.userData.nightWindowGeometry = geometry;
  }

  object.geometry = object.userData.nightWindowGeometry;
}

function paintNightWindowVertexColors(geometry, object, sourceMaterials) {
  const position = geometry.attributes.position;
  if (!position) {
    return;
  }

  geometry.computeBoundingBox();
  const boxSize = geometry.boundingBox.getSize(new THREE.Vector3());
  const cellSize = Math.max(Math.max(boxSize.x, boxSize.y, boxSize.z) * 0.16, 4.2);
  const colors = new Float32Array(position.count * 3);
  colors.fill(1);
  const color = new THREE.Color();
  const center = new THREE.Vector3();
  const windowMaterialSlots = new Set(
    sourceMaterials
      .map((material, index) => (isWindowSurface(object, material) ? index : -1))
      .filter((index) => index >= 0),
  );
  const groups = geometry.groups.length
    ? geometry.groups
    : [{ start: 0, count: position.count, materialIndex: 0 }];

  for (const group of groups) {
    if (!windowMaterialSlots.has(group.materialIndex)) {
      continue;
    }

    const end = Math.min(group.start + group.count, position.count);
    for (let i = group.start; i < end - 2; i += 6) {
      const faceEnd = Math.min(i + 6, end);
      center.set(0, 0, 0);
      for (let vertex = i; vertex < faceEnd; vertex += 1) {
        center.x += position.getX(vertex);
        center.y += position.getY(vertex);
        center.z += position.getZ(vertex);
      }
      center.multiplyScalar(1 / (faceEnd - i));
      color.set(nightWindowPaneColor(object, group.materialIndex, center, cellSize));
      for (let vertex = i; vertex < faceEnd; vertex += 1) {
        colors[vertex * 3] = color.r;
        colors[vertex * 3 + 1] = color.g;
        colors[vertex * 3 + 2] = color.b;
      }
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function nightWindowPaneColor(object, materialIndex, center, cellSize) {
  const paneKey = [
    Math.round(center.x / cellSize),
    Math.round(center.y / cellSize),
    Math.round(center.z / cellSize),
  ].join(':');
  const rng = seededRandom(hashString(`${object.name}:${materialIndex}:${paneKey}`));
  const roll = rng();

  if (roll < 0.52) {
    return rng() > 0.5 ? '#263b4a' : '#2b4552';
  }

  if (roll < 0.72) {
    return rng() > 0.5 ? '#c88b46' : '#d69a52';
  }

  return rng() > 0.36 ? '#ffd66f' : '#ffc15c';
}

function addInkLines(object) {
  if (object.userData.inkLine || !object.geometry?.attributes?.position) {
    return;
  }

  const sourceMaterial = Array.isArray(object.userData.sourceMaterial)
    ? object.userData.sourceMaterial[0]
    : object.userData.sourceMaterial;
  const category = classify(sourceMaterial?.name ?? object.name);
  if (category === 'foliage') {
    return;
  }

  if (!hasFinitePositions(object.geometry)) {
    return;
  }

  const edges = new THREE.EdgesGeometry(object.geometry, 32);
  if (!hasFinitePositions(edges)) {
    edges.dispose();
    return;
  }

  const brokenEdges = createBrokenInkGeometry(edges, `${object.name}:${sourceMaterial?.name ?? ''}`);
  edges.dispose();
  if (!brokenEdges) {
    return;
  }

  const line = new THREE.LineSegments(brokenEdges, inkLineMaterial);
  line.name = `${object.name || 'mesh'}_inkLines`;
  line.renderOrder = 3;
  object.add(line);
  object.userData.inkLine = line;
}

function removeInkLines(object) {
  const line = object.userData.inkLine;
  if (!line) {
    return;
  }

  object.remove(line);
  line.geometry?.dispose();
  delete object.userData.inkLine;
}

function createBrokenInkGeometry(edges, seedText) {
  const position = edges.attributes.position;
  if (!position || position.count < 2) {
    return null;
  }

  const rng = seededRandom(hashString(seedText));
  const out = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const jitter = new THREE.Vector3();
  const edgeDirection = new THREE.Vector3();
  const jitterAxis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);

  for (let i = 0; i < position.count - 1; i += 2) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    const length = a.distanceTo(b);
    if (length <= 0.0001 || rng() < 0.14 + rng() * 0.2) {
      continue;
    }

    edgeDirection.subVectors(b, a).normalize();
    jitterAxis.crossVectors(edgeDirection, Math.abs(edgeDirection.dot(up)) > 0.86 ? forward : up).normalize();

    if (length < 0.3) {
      const pieceCount = rng() > 0.76 ? 2 : 1;
      for (let piece = 0; piece < pieceCount; piece += 1) {
        const shortStart = rng() * 0.78;
        const shortEnd = Math.min(0.98, shortStart + 0.12 + rng() * 0.72);
        if (shortEnd - shortStart > 0.08 && rng() > 0.2) {
          pushSegment(out, start, end, jitter, jitterAxis, a, b, shortStart, shortEnd, length, rng);
        }
      }
      continue;
    }

    let cursor = rng() * (rng() > 0.55 ? 0.5 : 0.24);
    const edgeDensity = 0.62 + rng() * 0.5;
    while (cursor < 0.96) {
      const strokeRoll = rng();
      const segmentLength = strokeRoll > 0.86
        ? 0.42 + rng() * 0.48
        : strokeRoll < 0.24
          ? 0.035 + rng() * 0.13
          : 0.1 + rng() * 0.34;
      const t0 = Math.min(0.97, cursor + (rng() - 0.5) * 0.08);
      const t1 = Math.min(0.99, t0 + segmentLength * (0.65 + rng() * 0.7));

      if (t1 - t0 > 0.03 && rng() < edgeDensity) {
        pushSegment(out, start, end, jitter, jitterAxis, a, b, t0, t1, length, rng);
      }

      const gapRoll = rng();
      const gap = gapRoll > 0.8
        ? 0.22 + rng() * 0.32
        : gapRoll < 0.18
          ? 0.012 + rng() * 0.05
          : 0.045 + rng() * 0.2;
      cursor = t1 + gap;

      if (rng() < 0.34) {
        cursor += rng() * rng() * 0.34;
      }
    }
  }

  if (!out.length) {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return geometry;
}

function pushSegment(out, start, end, jitter, jitterAxis, a, b, t0, t1, length, rng) {
  start.lerpVectors(a, b, t0);
  end.lerpVectors(a, b, t1);
  const jitterAmount = Math.min(length * 0.018, 0.035) * (rng() - 0.5);
  jitter.copy(jitterAxis).multiplyScalar(jitterAmount);
  start.add(jitter);
  end.addScaledVector(jitter, 0.55 + rng() * 0.9);
  out.push(start.x, start.y, start.z, end.x, end.y, end.z);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hasFinitePositions(geometry) {
  const position = geometry?.attributes?.position;
  if (!position || !position.count) {
    return false;
  }

  for (let i = 0; i < position.count; i += 1) {
    if (
      !Number.isFinite(position.getX(i)) ||
      !Number.isFinite(position.getY(i)) ||
      !Number.isFinite(position.getZ(i))
    ) {
      return false;
    }
  }

  return true;
}

function sanitizeRuntimeGeometryAttributes(root) {
  let removed = 0;
  root?.traverse((object) => {
    const geometry = object.geometry;
    const position = geometry?.attributes?.position;
    if (!object.isMesh || !geometry || !position?.count) {
      return;
    }

    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      if (name !== 'position' && attribute?.count !== position.count) {
        geometry.deleteAttribute(name);
        removed += 1;
      }
    }

    const index = geometry.index;
    if (index) {
      let indexIsValid = true;
      for (let i = 0; i < index.count; i += 1) {
        if (index.getX(i) >= position.count) {
          indexIsValid = false;
          break;
        }
      }
      if (!indexIsValid) {
        geometry.setIndex(null);
        removed += 1;
      }
    }
  });

  if (removed) {
    console.info(`Cleaned ${removed} invalid runtime geometry attributes.`);
  }
}

function frameObject(root) {
  const box = getVisibleContentBox(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1);
  controls.target.copy(sphere.center);
  controls.target.y += radius * 0.06;
  camera.position.set(
    sphere.center.x + radius * 0.38,
    sphere.center.y + radius * 0.34,
    sphere.center.z + radius * 0.48,
  );
  camera.near = Math.max(radius / 1000, 0.1);
  camera.far = radius * 4;
  camera.updateProjectionMatrix();
  scene.fog.near = radius * 1.15;
  scene.fog.far = radius * 3.4;
}

function setFirstPersonSpawnView() {
  const spawn = spaceMarkers.playerSpawn;
  const lookAt = spaceMarkers.mailboxTask;
  const eye = new THREE.Vector3(
    spawn.x,
    spawn.y + firstPersonPreview.eyeHeight,
    spawn.z,
  );
  const direction = new THREE.Vector3(
    lookAt.x - spawn.x,
    0,
    lookAt.z - spawn.z,
  );

  if (direction.lengthSq() < 0.001) {
    direction.set(0, 0, 1);
  } else {
    direction.normalize();
  }

  const target = eye.clone().addScaledVector(direction, firstPersonPreview.lookAhead);
  target.y -= firstPersonPreview.lookDown;

  camera.position.copy(eye);
  controls.target.copy(target);
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  syncFirstPersonAnglesFromLook(eye, target);
  // 出生朝向在原计算基础上原地后转 180°（背向邮箱方向起步，而非面壁）。
  // 仅作用于出生视角，不改 syncFirstPersonAnglesFromLook 本身（鼠标/触摸回正等共用它）。
  firstPersonInput.yaw += Math.PI;
  applyFirstPersonCameraRotation();
}

function initFirstPersonControls() {
  canvas.addEventListener('click', (event) => {
    if (grandpaState.suppressNextCanvasClick) {
      grandpaState.suppressNextCanvasClick = false;
      return;
    }

    if (debugActive || isQuestPanelOpen() || document.pointerLockElement === canvas) {
      return;
    }

    if (handleTaskHotspotActivation(event)) {
      return;
    }

    if (mailboxTaskState.hasMailKey && canCompleteMailboxTask(event)) {
      completeMailboxTask();
      return;
    }

    if (runtimeConfig.isMobile && runtimeConfig.requestedControls !== 'desktop') {
      // 仅首次进入（游戏尚未开始）允许由空白点击补做控制初始化；
      // 一旦游戏开始，空白点击不再触发任何控制重置，避免莫名跳回体态校准。
      if (!gameUiState.started) {
        ensureMobileControlsReady();
      }
      return;
    }

    canvas.requestPointerLock?.();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (handleGrandpaPointerDown(event)) {
      return;
    }

    if (event.button === 0 && !debugActive && !isQuestPanelOpen() && handleTaskHotspotActivation(event)) {
      event.preventDefault();
      return;
    }

    if (
      event.button !== 0 ||
      debugActive ||
      isQuestPanelOpen() ||
      document.pointerLockElement !== canvas ||
      !mailboxTaskState.hasMailKey
    ) {
      return;
    }

    if (canCompleteMailboxTask()) {
      event.preventDefault();
      completeMailboxTask();
    }
  });

  window.addEventListener('pointerup', (event) => {
    if (grandpaState.holdPointerId === event.pointerId) {
      releaseGrandpaHold('松开了爷爷。');
    }
  });

  window.addEventListener('pointercancel', (event) => {
    if (grandpaState.holdPointerId === event.pointerId) {
      releaseGrandpaHold('松开了爷爷。');
    }
  });

  document.addEventListener('pointerlockchange', () => {
    firstPersonInput.pointerLocked = document.pointerLockElement === canvas;
    if (firstPersonInput.pointerLocked) {
      setStatus('已进入行走视角。');
    } else if (worldRoot && !isQuestPanelOpen()) {
      setStatus(sceneReadyStatus());
    }
  });

  document.addEventListener('mousemove', (event) => {
    if (!firstPersonInput.pointerLocked || debugActive || isQuestPanelOpen()) {
      return;
    }

    firstPersonInput.yaw -= event.movementX * firstPersonPreview.lookSensitivity;
    firstPersonInput.pitch -= event.movementY * firstPersonPreview.lookSensitivity;
    firstPersonInput.pitch = THREE.MathUtils.clamp(
      firstPersonInput.pitch,
      -firstPersonPreview.maxPitch,
      firstPersonPreview.maxPitch,
    );
    applyFirstPersonCameraRotation();
  });

  document.addEventListener('keydown', (event) => {
    if (isEditableDebugTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (isFirstPersonKey(event.code)) {
      firstPersonInput.keys.add(event.code);
      event.preventDefault();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (isFirstPersonKey(event.code)) {
      firstPersonInput.keys.delete(event.code);
      event.preventDefault();
    }
  });
}

function handleTaskHotspotActivation(event) {
  if (mailboxTaskState.hasMailKey && canCompleteMailboxTask(event)) {
    completeMailboxTask();
    return true;
  }

  if (mailboxTaskState.completed && !schoolTaskState.completed && pickSchoolTask(event)) {
    openSchoolQuest();
    return true;
  }

  if (schoolTaskState.completed && !homeTaskState.completed && pickHomeTask(event)) {
    openDeliveryPanel();
    return true;
  }

  return false;
}

function initMobileControls() {
  if (!runtimeConfig.isMobile || runtimeConfig.requestedControls === 'desktop') {
    mobileInput.mode = 'desktop';
    return;
  }

  mobileInput.mode = runtimeConfig.requestedControls === 'joystick' ? 'joystick' : 'sensor';
  document.body.classList.add('mobile-runtime');
  createMobileControlUi();

  if (mobileInput.mode === 'joystick') {
    setMobileControlMode('joystick', '方向摇杆已启用。');
  } else {
    setMobileControlMode('sensor', '轻触开始后进行体感校准。');
  }

  canvas.addEventListener('pointerdown', handleMobileLookPointerDown);
  window.addEventListener('pointermove', handleMobileLookPointerMove, { passive: false });
  window.addEventListener('pointerup', handleMobileLookPointerEnd);
  window.addEventListener('pointercancel', handleMobileLookPointerEnd);
}

function createMobileControlUi() {
  const shell = document.createElement('section');
  shell.className = 'mobile-controls';
  shell.setAttribute('aria-label', 'Mobile movement controls');
  shell.hidden = true;
  shell.innerHTML = `
    <div class="mobile-controls-status">
      <span data-mobile-status>点击画面启用步行感应</span>
      <button type="button" class="mobile-controls-switch ui-icon-button" data-mobile-switch>
        <img class="ui-button-icon" src="${uiAssets.settingsButton}" alt="" />
        <span class="ui-button-label">摇杆</span>
      </button>
    </div>
    <div class="mobile-dpad" aria-label="方向摇杆">
      <button type="button" class="mobile-dpad-button mobile-dpad-up" data-mobile-move="forward" aria-label="前进">
        <span class="mobile-dpad-icon" aria-hidden="true"></span>
      </button>
      <button type="button" class="mobile-dpad-button mobile-dpad-left" data-mobile-move="left" aria-label="左移">
        <span class="mobile-dpad-icon" aria-hidden="true"></span>
      </button>
      <button type="button" class="mobile-dpad-button mobile-dpad-right" data-mobile-move="right" aria-label="右移">
        <span class="mobile-dpad-icon" aria-hidden="true"></span>
      </button>
      <button type="button" class="mobile-dpad-button mobile-dpad-down" data-mobile-move="back" aria-label="后退">
        <span class="mobile-dpad-icon" aria-hidden="true"></span>
      </button>
    </div>
  `;
  document.querySelector('#app')?.appendChild(shell);

  mobileInput.ui.shell = shell;
  mobileInput.ui.status = shell.querySelector('[data-mobile-status]');
  mobileInput.ui.switchButton = shell.querySelector('[data-mobile-switch]');
  mobileInput.ui.buttons = [...shell.querySelectorAll('[data-mobile-move]')];

  mobileInput.ui.switchButton?.addEventListener('click', (event) => {
    event.preventDefault();
    setMobileControlMode('joystick', '方向摇杆已启用。');
  });

  for (const button of mobileInput.ui.buttons) {
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      mobileInput.activeMoveButtons.add(button.dataset.mobileMove);
      button.setPointerCapture?.(event.pointerId);
      updateMobileJoystickVector();
    });
    button.addEventListener('pointerup', () => {
      mobileInput.activeMoveButtons.delete(button.dataset.mobileMove);
      updateMobileJoystickVector();
    });
    button.addEventListener('pointercancel', () => {
      mobileInput.activeMoveButtons.delete(button.dataset.mobileMove);
      updateMobileJoystickVector();
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}

async function ensureMobileControlsReady() {
  if (runtimeConfig.requestedControls === 'joystick') {
    setMobileControlMode('joystick', '方向摇杆已启用。');
    return;
  }

  if (mobileInput.sensorListening) {
    setMobileControlMode('sensor', mobileInput.motionSampleCount > 0
      ? '步行感应已启用。'
      : '等待步行感应数据。');
    return;
  }

  openCalibrationScreen();
}

function openCalibrationScreen() {
  // 护栏：游戏一旦开始，绝不再重开体态校准向导（这是「莫名跳回校准」Bug 的根因——
  // 切后台/传感器抖动会使 sensorListening 短暂为 false，叠加空白点击就会重弹向导）。
  // 此时改为静默恢复传感器，不打断玩家。
  if (gameUiState.started) {
    resumeSensorSilently();
    return;
  }
  if (!uiScreens.calibration) {
    // 没有分步向导 DOM 时退回单次校准（理论上不会发生，DOM 已内置）。
    startMobileSensorCalibration();
    return;
  }
  if (uiScreens.loading) {
    uiScreens.loading.hidden = true;
  }
  document.body.classList.remove('ui-loading');
  uiScreens.calibration.hidden = false;
  syncQuestOpenClass();
  resetCalibrationWizard();
  goToCalibrationStep(1);
}

// 游戏进行中传感器掉线时静默重启，不弹校准向导、不冻结玩家。
function resumeSensorSilently() {
  if (runtimeConfig.requestedControls === 'joystick') {
    setMobileControlMode('joystick', '方向摇杆已启用。');
    return;
  }
  if (mobileInput.sensorListening) {
    setMobileControlMode('sensor', '体感步行已启用。');
    return;
  }
  if (mobileInput.sensorPermission === 'granted') {
    sensorBus.start()
      .then(() => startMotionSensor())
      .catch((error) => {
        console.warn('Sensor silent resume failed', error);
        setMobileControlMode('desktop-touch', '体感暂不可用。拖动右侧看向，或连接键盘继续。');
      });
    return;
  }
  // 从未成功授权过（极少见）：保持触摸看向，不强行弹校准。
  setMobileControlMode('desktop-touch', '体感未启用。拖动右侧看向，或连接键盘继续。');
}

function closeCalibrationScreen() {
  stopMetronome();
  if (uiScreens.calibration) {
    uiScreens.calibration.hidden = true;
  }
  syncQuestOpenClass();
}

// 清空向导运行时状态（订阅、定时器、转身/步频记录）。不触碰已记录的零位。
function resetCalibrationWizard() {
  stopMetronome();
  if (calibrationState.uiUnsub) {
    calibrationState.uiUnsub();
    calibrationState.uiUnsub = null;
  }
  if (calibrationState.baselineTimer) {
    window.clearInterval(calibrationState.baselineTimer);
    calibrationState.baselineTimer = 0;
  }
  calibrationState.step = 0;
  calibrationState.turnLeftDone = false;
  calibrationState.turnRightDone = false;
  calibrationState.stepTimes = [];
  calibrationState.matchedCadence = false;
  mobileInput.calibrationRunning = false;
}

// === 校准节拍器：步骤 4 播放目标 BPM 节拍，引导玩家踏步对齐（Web Audio 简单 click） ===
const metronome = { ctx: null, timer: 0 };

function ensureMetronomeContext() {
  if (!metronome.ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (Ctor) {
      metronome.ctx = new Ctor();
    }
  }
  return metronome.ctx;
}

function pulseMetronomeBeat() {
  const dot = uiElements.calibrationBeat;
  if (!dot) {
    return;
  }
  dot.classList.remove('beat-on');
  void dot.offsetWidth; // 强制重排，确保每拍都重新触发动画
  dot.classList.add('beat-on');
}

function metronomeTick() {
  const ctx = metronome.ctx;
  if (ctx && ctx.state !== 'closed') {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }
  pulseMetronomeBeat();
}

function startMetronome(bpm = METRONOME_BPM) {
  stopMetronome();
  const ctx = ensureMetronomeContext();
  if (ctx?.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  metronomeTick();
  metronome.timer = window.setInterval(metronomeTick, 60000 / bpm);
}

function stopMetronome() {
  if (metronome.timer) {
    window.clearInterval(metronome.timer);
    metronome.timer = 0;
  }
}

function goToCalibrationStep(step) {
  calibrationState.step = step;
  if (step === 3) {
    calibrationState.turnLeftDone = false;
    calibrationState.turnRightDone = false;
  }
  if (step === 4) {
    calibrationState.stepTimes = [];
    calibrationState.matchedCadence = false;
    initAutoSensitivity();
    startMetronome(CALIBRATION_TARGET_BPM);
  }
  // 步骤 3、4 需要实时读数（相对角度 / 步频），单独订阅一条不动相机的回调。
  if ((step === 3 || step === 4) && !calibrationState.uiUnsub) {
    calibrationState.uiUnsub = sensorBus.subscribe(handleCalibrationSample);
  }
  renderCalibrationStep();
  if (step === 2) {
    startCalibrationBaseline();
  }
}

function renderCalibrationStep() {
  const def = calibrationSteps[calibrationState.step];
  if (!def) {
    return;
  }
  if (uiElements.calibrationGuide && Array.isArray(uiAssets.motionGuide)) {
    const src = uiAssets.motionGuide[def.guide];
    if (src && !uiElements.calibrationGuide.src.endsWith(src)) {
      uiElements.calibrationGuide.src = src;
    }
  }
  if (uiElements.calibrationKicker) {
    uiElements.calibrationKicker.textContent = def.kicker;
  }
  if (uiElements.calibrationTitle) {
    uiElements.calibrationTitle.textContent = def.title;
  }
  if (uiElements.calibrationStatus) {
    uiElements.calibrationStatus.textContent = def.status;
  }
  setButtonLabel(uiElements.calibrationStart, def.primary);

  const step = calibrationState.step;
  if (uiElements.calibrationMeterTrack) {
    uiElements.calibrationMeterTrack.hidden = step !== 2;
  }
  if (uiElements.calibrationAngle) {
    uiElements.calibrationAngle.hidden = step !== 3;
    if (step === 3) {
      uiElements.calibrationAngle.textContent = '当前相对角度：0°';
    }
  }
  if (uiElements.calibrationGait) {
    uiElements.calibrationGait.hidden = step !== 4;
  }
  if (uiElements.calibrationStepfreq && step === 4) {
    uiElements.calibrationStepfreq.textContent = `当前步频：0 步/分 · 目标 ${CALIBRATION_TARGET_BPM}`;
  }
  if (uiElements.calibrationStart) {
    // 第 2 步自动推进，按钮锁定；其余步骤可点。
    uiElements.calibrationStart.disabled = step === 2;
  }
}

// 步骤 2：请求权限 + 站稳 5 秒记录零位与基线 RMS，完成后自动进入步骤 3。
async function startCalibrationBaseline() {
  mobileInput.calibrationStartedAt = performance.now();
  mobileInput.yawStart = firstPersonInput.yaw;
  mobileInput.pitchStart = firstPersonInput.pitch;
  mobileInput.queuedStepDistance = 0;
  mobileInput.calibrationRunning = true;
  setMobileControlMode('sensor', '正在校准体感。');

  const sensorStartPromise = sensorBus.start();
  const immersivePromise = enterImmersiveMode().catch(() => null);
  try {
    await withTimeout(sensorStartPromise, mobileSensorConfig.permissionTimeoutMs, 'sensor permission timed out');
    mobileInput.sensorPermission = 'granted';
    await immersivePromise;
    startMotionSensor();
    calibrationState.baselineTimer = window.setInterval(() => {
      const elapsed = performance.now() - mobileInput.calibrationStartedAt;
      const progress = THREE.MathUtils.clamp(elapsed / motionControlConfig.calibrationDurationMs, 0, 1);
      if (uiElements.calibrationMeter) {
        uiElements.calibrationMeter.style.width = `${Math.round(progress * 100)}%`;
      }
    }, 100);
    const calibration = await sensorBus.calibrate(motionControlConfig.calibrationDurationMs);
    window.clearInterval(calibrationState.baselineTimer);
    calibrationState.baselineTimer = 0;
    if (calibrationState.step !== 2) {
      return; // 用户中途切换到键鼠模式
    }
    mobileInput.yawZeroDeg = calibration.orientation.alpha;
    mobileInput.yawStart = firstPersonInput.yaw;
    mobileInput.pitchZeroDeg = calibration.orientation.beta;
    mobileInput.pitchStart = firstPersonInput.pitch;
    calibrationState.baselineRms = calibration.baselineRms;
    sensorBus.setBaselineRms(calibration.baselineRms);
    if (uiElements.calibrationMeter) {
      uiElements.calibrationMeter.style.width = '100%';
    }
    goToCalibrationStep(3);
  } catch (error) {
    if (calibrationState.baselineTimer) {
      window.clearInterval(calibrationState.baselineTimer);
      calibrationState.baselineTimer = 0;
    }
    if (calibrationState.step === 0) {
      return; // 已被键鼠模式处理
    }
    console.warn('Motion sensor calibration failed', error);
    mobileInput.sensorPermission = 'denied';
    mobileInput.calibrationRunning = false;
    calibrationState.step = 0;
    stopMotionSensor();
    releaseImmersiveMode();
    closeCalibrationScreen();
    setMobileControlMode('desktop-touch', '体感不可用。可拖动右侧看向，连接键盘或换桌面继续。');
    enterStartedGameplay();
  }
}

// 步骤 3、4 的实时读数：相对角度 / 步频。不写相机（calibrationRunning 期间 handleSensorState 已早退）。
function handleCalibrationSample(state) {
  if (calibrationState.step === 3) {
    const relative = shortestAngleDeltaDeg(state.orientation.alpha, mobileInput.yawZeroDeg);
    if (uiElements.calibrationAngle) {
      uiElements.calibrationAngle.textContent = `当前相对角度：${Math.round(relative)}°`;
    }
    if (relative <= -CALIBRATION_TURN_THRESHOLD_DEG) {
      calibrationState.turnLeftDone = true;
    }
    if (relative >= CALIBRATION_TURN_THRESHOLD_DEG) {
      calibrationState.turnRightDone = true;
    }
    if (uiElements.calibrationStatus) {
      if (calibrationState.turnLeftDone && calibrationState.turnRightDone) {
        uiElements.calibrationStatus.textContent = '转身识别成功！点「进入步态校准」继续。';
      } else {
        const remaining = [];
        if (!calibrationState.turnLeftDone) remaining.push('左');
        if (!calibrationState.turnRightDone) remaining.push('右');
        uiElements.calibrationStatus.textContent = `还需向${remaining.join('、')}转身超过 ${CALIBRATION_TURN_THRESHOLD_DEG}°。`;
      }
    }
    return;
  }
  if (calibrationState.step === 4) {
    if (state.stepEvent) {
      calibrationState.stepTimes.push(state.timestamp);
    }
    const cutoff = state.timestamp - CALIBRATION_STEP_WINDOW_MS;
    calibrationState.stepTimes = calibrationState.stepTimes.filter((time) => time >= cutoff);
    autoTuneSensitivity(state.timestamp);
    updateStepCalibrationFeedback();
  }
}

function cadenceFromTimes(times) {
  if (!times || times.length < 2) {
    return 0;
  }
  const span = times[times.length - 1] - times[0];
  if (span <= 0) {
    return 0;
  }
  return Math.round(((times.length - 1) / span) * 60000);
}

function computeStepFrequency() {
  return cadenceFromTimes(calibrationState.stepTimes);
}

function cadenceStability(times) {
  if (!times || times.length < 4) {
    return Infinity;
  }
  const intervals = [];
  for (let index = 1; index < times.length; index += 1) {
    const interval = times[index] - times[index - 1];
    if (interval > 0) {
      intervals.push(interval);
    }
  }
  if (intervals.length < 3) {
    return Infinity;
  }
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance = intervals.reduce((sum, value) => sum + (value - average) ** 2, 0) / intervals.length;
  return Math.sqrt(variance) / average;
}

function updateStepCalibrationFeedback() {
  const freq = computeStepFrequency();
  const sampleCount = calibrationState.stepTimes.length;
  const stability = cadenceStability(calibrationState.stepTimes);
  if (uiElements.calibrationStepfreq) {
    uiElements.calibrationStepfreq.textContent = `当前步频：${freq} 步/分 · 目标 ${CALIBRATION_TARGET_BPM}`;
  }
  if (!uiElements.calibrationStatus) {
    return;
  }

  let feedback = `跟着 ${CALIBRATION_TARGET_BPM} 次/分钟的节拍原地踏步，系统正在自动校准识别灵敏度…`;
  if (sampleCount >= 8) {
    if (stability > 0.28) {
      feedback = '保持稳定，每一下都踩在提示音上，正在自动校准…';
      calibrationState.matchedCadence = false;
    } else if (freq < CALIBRATION_TARGET_BPM - 10 || freq > CALIBRATION_TARGET_BPM + 10) {
      // 偏差多来自识别灵敏度，autoTuneSensitivity 会自动收敛——只要继续跟拍即可。
      feedback = '识别校准中…继续跟着节拍踏步就好。';
      calibrationState.matchedCadence = false;
    } else {
      feedback = '匹配成功。这个节奏就是游戏里的正常走路。';
      calibrationState.matchedCadence = true;
    }
  }
  uiElements.calibrationStatus.textContent = feedback;
}

function mapCadenceToWalkSpeed(cadence) {
  const safeCadence = Number.isFinite(cadence) && cadence > 0 ? cadence : CALIBRATION_TARGET_BPM;
  if (safeCadence <= CALIBRATION_TARGET_BPM) {
    return motionControlConfig.stepSpeed * THREE.MathUtils.clamp(safeCadence / CALIBRATION_TARGET_BPM, 0.72, 1);
  }
  const fastT = THREE.MathUtils.clamp((safeCadence - CALIBRATION_TARGET_BPM) / 30, 0, 1);
  return THREE.MathUtils.lerp(motionControlConfig.stepSpeed, motionControlConfig.walkSpeedMax, fastT);
}

// 自适应自动灵敏度：不再让玩家手动调灵敏度。以第 2 步实测的静止基线为起点，
// 在第 4 步（目标 BPM）踏步时自动微调步检测阈值，让检测步频向目标收敛。
function initAutoSensitivity() {
  const base = Number.isFinite(calibrationState.baselineRms) && calibrationState.baselineRms > 0
    ? calibrationState.baselineRms
    : 0.35;
  calibrationState.autoRms = base;
  calibrationState.autoTuneAt = 0;
  sensorBus.setBaselineRms(Math.max(base, 0.05));
}

// 第 4 步每帧调用：假定玩家在跟随节拍器(CALIBRATION_TARGET_BPM)踏步，
// 据检测步频与稳定度自动升/降阈值，约每 900ms 调一次。
function autoTuneSensitivity(now) {
  if (now - (calibrationState.autoTuneAt || 0) < 700) {
    return;
  }
  if (calibrationState.stepTimes.length < 4) {
    return;
  }
  const base = Number.isFinite(calibrationState.baselineRms) && calibrationState.baselineRms > 0
    ? calibrationState.baselineRms
    : 0.35;
  const target = CALIBRATION_TARGET_BPM;
  const freq = computeStepFrequency();
  const stability = cadenceStability(calibrationState.stepTimes);
  if (freq <= 0) {
    return;
  }
  let rms = calibrationState.autoRms || base;
  // 已稳定落在目标带内（与 updateStepCalibrationFeedback 的"匹配成功"判定一致）→ 保持。
  if (freq >= target - 6 && freq <= target + 8 && stability <= 0.26) {
    return;
  }
  if (freq < target - 6) {
    // 漏步：检测步频偏低 → 降阈值变灵敏。偏得越多降得越狠（半数→×0.72，更低→最多 ×0.55），锁得更快。
    const ratio = THREE.MathUtils.clamp(freq / target, 0.25, 1);
    rms *= THREE.MathUtils.lerp(0.55, 0.9, ratio);
  } else {
    // 偏快或不稳（多为一步被重复计数）→ 升阈值变钝。
    rms *= 1.18;
  }
  rms = THREE.MathUtils.clamp(rms, 0.05, base * 2.4);
  calibrationState.autoRms = rms;
  calibrationState.autoTuneAt = now;
  sensorBus.setBaselineRms(rms);
}

function handleCalibrationPrimary() {
  switch (calibrationState.step) {
    case 1:
      goToCalibrationStep(2);
      break;
    case 3:
      goToCalibrationStep(4);
      break;
    case 4:
      finishCalibration();
      break;
    default:
      break;
  }
}

function finishCalibration() {
  if (calibrationState.uiUnsub) {
    calibrationState.uiUnsub();
    calibrationState.uiUnsub = null;
  }
  stopMetronome();
  // 锁定自动灵敏度收敛后的阈值（不再有手动滑条）。
  if (calibrationState.autoRms > 0) {
    sensorBus.setBaselineRms(calibrationState.autoRms);
  }
  mobileInput.referenceCadence = CALIBRATION_TARGET_BPM; // 速度映射基准：跟练时的目标步频
  mobileInput.stepTimes = [];
  mobileInput.liveCadence = 0;
  mobileInput.calibrationRunning = false;
  calibrationState.step = 0;
  closeCalibrationScreen();
  setMobileControlMode('sensor', '体感步行已启用。');
  enterStartedGameplay();
  setStatus(sceneReadyStatus());
}

function updateCalibrationUi(message, progress) {
  if (uiElements.calibrationStatus) {
    uiElements.calibrationStatus.textContent = message;
  }
  const safeProgress = THREE.MathUtils.clamp(progress, 0, 1);
  if (uiElements.calibrationMeter) {
    uiElements.calibrationMeter.style.width = `${Math.round(safeProgress * 100)}%`;
  }
  // Advance the 体态引导 (motion guidance) illustration through its 4 steps as calibration progresses.
  if (uiElements.calibrationGuide && Array.isArray(uiAssets.motionGuide)) {
    const step = Math.min(uiAssets.motionGuide.length - 1, Math.floor(safeProgress * uiAssets.motionGuide.length));
    const nextSrc = uiAssets.motionGuide[step];
    if (nextSrc && !uiElements.calibrationGuide.src.endsWith(nextSrc)) {
      uiElements.calibrationGuide.src = nextSrc;
    }
  }
}

async function startMobileSensorCalibration() {
  if (mobileInput.calibrationRunning) {
    return;
  }
  mobileInput.calibrationRunning = true;
  mobileInput.calibrationStartedAt = performance.now();
  mobileInput.yawStart = firstPersonInput.yaw;
  mobileInput.pitchStart = firstPersonInput.pitch;
  mobileInput.queuedStepDistance = 0;
  if (uiElements.calibrationStart) {
    uiElements.calibrationStart.disabled = true;
  }
  updateCalibrationUi('正在请求体感权限...', 0.05);
  setMobileControlMode('sensor', '正在校准体感。');

  let progressTimer = 0;
  const sensorStartPromise = sensorBus.start();
  const immersivePromise = enterImmersiveMode().catch(() => null);
  try {
    await withTimeout(sensorStartPromise, mobileSensorConfig.permissionTimeoutMs, 'sensor permission timed out');
    mobileInput.sensorPermission = 'granted';
    await immersivePromise;
    startMotionSensor();
    progressTimer = window.setInterval(() => {
      const elapsed = performance.now() - mobileInput.calibrationStartedAt;
      updateCalibrationUi('保持站姿，原地慢走几步用于校准...', elapsed / motionControlConfig.calibrationDurationMs);
    }, 100);
    const calibration = await sensorBus.calibrate(motionControlConfig.calibrationDurationMs);
    window.clearInterval(progressTimer);
    progressTimer = 0;
    mobileInput.yawZeroDeg = calibration.orientation.alpha;
    mobileInput.yawStart = firstPersonInput.yaw;
    mobileInput.pitchZeroDeg = calibration.orientation.beta;
    mobileInput.pitchStart = firstPersonInput.pitch;
    sensorBus.setBaselineRms(calibration.baselineRms);
    updateCalibrationUi('校准完成。开始送信。', 1);
    closeCalibrationScreen();
    setMobileControlMode('sensor', '体感步行已启用。');
    enterStartedGameplay();
    setStatus(sceneReadyStatus());
  } catch (error) {
    if (progressTimer) {
      window.clearInterval(progressTimer);
    }
    console.warn('Motion sensor calibration failed', error);
    mobileInput.sensorPermission = 'denied';
    stopMotionSensor();
    releaseImmersiveMode();
    closeCalibrationScreen();
    setMobileControlMode('desktop-touch', '体感不可用。可拖动右侧看向，连接键盘或换桌面继续。');
    enterStartedGameplay();
  } finally {
    mobileInput.calibrationRunning = false;
    if (uiElements.calibrationStart) {
      uiElements.calibrationStart.disabled = false;
    }
  }
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function startMotionSensor() {
  // 步检测不应期：取目标步频间隔的 ~60%（90BPM→~400ms），抑制单步双峰被计成两步（曾在 iPad 上读成 180）。
  sensorBus.setMinStepIntervalMs(Math.round((60000 / CALIBRATION_TARGET_BPM) * 0.6));
  if (mobileInput.sensorListening) {
    return;
  }

  mobileInput.sensorUnsubscribe = sensorBus.subscribe(handleSensorState);
  mobileInput.sensorListening = true;
  mobileInput.sensorAvailable = true;
  mobileInput.lastMotionAt = 0;
  mobileInput.motionSampleCount = 0;
  clearMobileSensorCheck();
  mobileInput.sensorCheckTimer = window.setTimeout(() => {
    if (
      mobileInput.mode === 'sensor'
      && mobileInput.motionSampleCount === 0
      && !mobileInput.calibrationRunning
    ) {
      setMobileControlMode('desktop-touch', '未收到体感数据。可拖动右侧看向，连接键盘或换桌面继续。');
    }
  }, mobileSensorConfig.firstSampleTimeoutMs);
}

function stopMotionSensor() {
  if (!mobileInput.sensorListening) {
    sensorBus.stop();
    mobileInput.queuedStepDistance = 0;
    clearMobileSensorCheck();
    return;
  }

  mobileInput.sensorUnsubscribe?.();
  mobileInput.sensorUnsubscribe = null;
  sensorBus.stop();
  mobileInput.sensorListening = false;
  mobileInput.queuedStepDistance = 0;
  clearMobileSensorCheck();
}

function clearMobileSensorCheck() {
  if (!mobileInput.sensorCheckTimer) {
    return;
  }

  window.clearTimeout(mobileInput.sensorCheckTimer);
  mobileInput.sensorCheckTimer = 0;
}

function handleSensorState(state) {
  if (mobileInput.mode !== 'sensor') {
    return;
  }

  mobileInput.lastMotionAt = performance.now();
  mobileInput.motionSampleCount += 1;
  if (mobileInput.motionSampleCount === 1) {
    clearMobileSensorCheck();
    setMobileControlMode('sensor', '体感步行已启用。');
  }

  if (mobileInput.calibrationRunning || performanceStats.paused || isQuestPanelOpen()) {
    return;
  }

  const yawDelta = THREE.MathUtils.degToRad(shortestAngleDeltaDeg(state.orientation.alpha, mobileInput.yawZeroDeg));
  firstPersonInput.yaw = mobileInput.yawStart + yawDelta;

  // True 3D look: map device beta (forward/back tilt) to camera pitch (look up/down).
  // 把手机顶部抬起（看上方）→ 视角向上。之前符号反了导致上下颠倒，这里取反修正。
  const pitchDelta = THREE.MathUtils.degToRad(shortestAngleDeltaDeg(state.orientation.beta, mobileInput.pitchZeroDeg));
  firstPersonInput.pitch = THREE.MathUtils.clamp(
    mobileInput.pitchStart - pitchDelta,
    -firstPersonPreview.maxPitch,
    firstPersonPreview.maxPitch,
  );
  applyFirstPersonCameraRotation();

  if (state.stepEvent) {
    mobileInput.queuedStepDistance = Math.min(
      mobileInput.queuedStepDistance + motionControlConfig.stepDistance,
      motionControlConfig.maxQueuedStepDistance,
    );
    mobileInput.stepTimes.push(state.timestamp ?? performance.now());
  }
  // 维护滚动步频窗口（约 2.6s），实时算出步频供"步频→速度→丢爷爷"映射使用。
  const cadenceCutoff = (state.timestamp ?? performance.now()) - 2600;
  if (mobileInput.stepTimes.length) {
    mobileInput.stepTimes = mobileInput.stepTimes.filter((time) => time >= cadenceCutoff);
  }
  mobileInput.liveCadence = cadenceFromTimes(mobileInput.stepTimes);
}

function setMobileControlMode(nextMode, message) {
  mobileInput.mode = nextMode;
  document.body.classList.toggle('mobile-joystick-active', nextMode === 'joystick');
  document.body.classList.toggle('mobile-sensor-active', nextMode === 'sensor');
  document.body.classList.toggle('mobile-desktop-touch-active', nextMode === 'desktop-touch');
  if (mobileInput.ui.shell) {
    mobileInput.ui.shell.hidden = false;
  }
  if (mobileInput.ui.switchButton) {
    mobileInput.ui.switchButton.hidden = nextMode === 'desktop-touch';
  }
  if (mobileInput.ui.status) {
    mobileInput.ui.status.textContent = message;
  }
  setStatus(message);

  if (nextMode !== 'sensor') {
    stopMotionSensor();
  }
}

function updateMobileJoystickVector() {
  const forward = Number(mobileInput.activeMoveButtons.has('forward')) - Number(mobileInput.activeMoveButtons.has('back'));
  const strafe = Number(mobileInput.activeMoveButtons.has('right')) - Number(mobileInput.activeMoveButtons.has('left'));
  mobileInput.joystickVector.set(strafe, forward);
  if (mobileInput.joystickVector.lengthSq() > 1) {
    mobileInput.joystickVector.normalize();
  }
}

function handleMobileLookPointerDown(event) {
  if (
    mobileInput.mode === 'desktop' ||
    debugActive ||
    isQuestPanelOpen() ||
    event.target?.closest?.('.mobile-controls, .hud, .debug-panel, .quest-panel')
  ) {
    return;
  }

  if (event.clientX < window.innerWidth * 0.42) {
    return;
  }

  mobileInput.lookPointerId = event.pointerId;
  mobileInput.lookX = event.clientX;
  mobileInput.lookY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
}

function handleMobileLookPointerMove(event) {
  if (mobileInput.lookPointerId !== event.pointerId || debugActive || isQuestPanelOpen()) {
    return;
  }

  event.preventDefault();
  const dx = event.clientX - mobileInput.lookX;
  const dy = event.clientY - mobileInput.lookY;
  mobileInput.lookX = event.clientX;
  mobileInput.lookY = event.clientY;
  firstPersonInput.yaw -= dx * firstPersonPreview.lookSensitivity * 1.15;
  firstPersonInput.pitch -= dy * firstPersonPreview.lookSensitivity * 1.15;
  firstPersonInput.pitch = THREE.MathUtils.clamp(
    firstPersonInput.pitch,
    -firstPersonPreview.maxPitch,
    firstPersonPreview.maxPitch,
  );
  applyFirstPersonCameraRotation();
}

function handleMobileLookPointerEnd(event) {
  if (mobileInput.lookPointerId === event.pointerId) {
    mobileInput.lookPointerId = null;
  }
}

function isEditableDebugTarget(target) {
  return target?.matches?.('input, textarea, select, [contenteditable="true"]');
}

function isFirstPersonKey(code) {
  return [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ShiftLeft',
    'ShiftRight',
    'Space',
  ].includes(code);
}

function syncFirstPersonAnglesFromLook(eye, target) {
  const direction = target.clone().sub(eye).normalize();
  firstPersonInput.yaw = Math.atan2(-direction.x, -direction.z);
  firstPersonInput.pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
  firstPersonInput.pitch = THREE.MathUtils.clamp(
    firstPersonInput.pitch,
    -firstPersonPreview.maxPitch,
    firstPersonPreview.maxPitch,
  );
  applyFirstPersonCameraRotation();
}

function applyFirstPersonCameraRotation() {
  camera.rotation.set(firstPersonInput.pitch, firstPersonInput.yaw, 0, 'YXZ');
}

function updateFirstPersonMovement(deltaSeconds) {
  if (!worldRoot || debugActive || isQuestPanelOpen() || gameUiState.grandpaLeading || !isMovementControlActive()) {
    return;
  }

  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor' && mobileInput.queuedStepDistance > 0) {
    // 踏步越快 → 排空越快 → 走得越快（基准为校准时的目标步频）。
    const drainSpeed = THREE.MathUtils.clamp(
      mapCadenceToWalkSpeed(mobileInput.liveCadence || mobileInput.referenceCadence || CALIBRATION_TARGET_BPM),
      motionControlConfig.walkSpeedMin,
      motionControlConfig.walkSpeedMax,
    );
    const travelDistance = Math.min(
      mobileInput.queuedStepDistance,
      drainSpeed * deltaSeconds,
    );
    mobileInput.queuedStepDistance = Math.max(0, mobileInput.queuedStepDistance - travelDistance);
    moveFirstPersonWithCollision(new THREE.Vector3(
      -Math.sin(firstPersonInput.yaw) * travelDistance,
      0,
      -Math.cos(firstPersonInput.yaw) * travelDistance,
    ));
    camera.position.y = firstPersonGroundEyeY();
    updateLodVisibility();
    return;
  }

  const movementInput = getMovementInput();
  const forwardInput = movementInput.forward;
  const strafeInput = movementInput.strafe;

  const move = new THREE.Vector3();
  if (forwardInput !== 0) {
    move.x += -Math.sin(firstPersonInput.yaw) * forwardInput;
    move.z += -Math.cos(firstPersonInput.yaw) * forwardInput;
  }
  if (strafeInput !== 0) {
    move.x += Math.cos(firstPersonInput.yaw) * strafeInput;
    move.z += -Math.sin(firstPersonInput.yaw) * strafeInput;
  }

  if (move.lengthSq() > 0) {
    move.normalize();
    const sprinting = isSprintPressed();
    const speed = firstPersonPreview.moveSpeed
      * (sprinting ? firstPersonPreview.runMultiplier : 1);
    moveFirstPersonWithCollision(move.multiplyScalar(speed * deltaSeconds));
  }

  camera.position.y = firstPersonGroundEyeY();
  updateLodVisibility();
}

function updateLodVisibility() {
  if (!runtimeConfig.isMobile || !worldRoot || !lodRoot || runtimeConfig.quality === 'desktop') {
    return;
  }

  const center = sceneCache.visibleContentCenter;
  const distance = Math.hypot(camera.position.x - center.x, camera.position.z - center.z);
  const sceneRadius = Math.max(sceneCache.visibleContentSize.x, sceneCache.visibleContentSize.z) * 0.42;
  const shouldUseLod = distance > sceneRadius && !isQuestPanelOpen();
  if (lodRoot.visible === shouldUseLod) {
    return;
  }

  lodRoot.visible = shouldUseLod;
  worldRoot.visible = !shouldUseLod;
  lodSceneStats.visible = shouldUseLod;
}

function isMovementControlActive() {
  return firstPersonInput.pointerLocked
    || (runtimeConfig.isMobile && mobileInput.mode !== 'desktop')
    || mobileInput.mode === 'desktop-touch';
}

function getMovementInput() {
  const keyboardForward = Number(firstPersonInput.keys.has('KeyW') || firstPersonInput.keys.has('ArrowUp'))
    - Number(firstPersonInput.keys.has('KeyS') || firstPersonInput.keys.has('ArrowDown'));
  const keyboardStrafe = Number(firstPersonInput.keys.has('KeyD') || firstPersonInput.keys.has('ArrowRight'))
    - Number(firstPersonInput.keys.has('KeyA') || firstPersonInput.keys.has('ArrowLeft'));

  if (!runtimeConfig.isMobile || mobileInput.mode === 'desktop' || mobileInput.mode === 'desktop-touch') {
    return {
      forward: keyboardForward,
      strafe: keyboardStrafe,
    };
  }

  if (mobileInput.mode === 'joystick') {
    return {
      forward: mobileInput.joystickVector.y,
      strafe: mobileInput.joystickVector.x,
    };
  }

  return {
    forward: 0,
    strafe: 0,
  };
}

function isSprintPressed() {
  return firstPersonInput.keys.has('ShiftLeft') || firstPersonInput.keys.has('ShiftRight');
}

function moveFirstPersonWithCollision(offset) {
  if (!worldCollisionOctree) {
    camera.position.add(offset);
    clampFirstPersonToScene();
    return;
  }

  const previousPosition = camera.position.clone();
  camera.position.add(offset);
  updatePlayerColliderFromCamera();

  const result = worldCollisionOctree.capsuleIntersect(playerCollider);
  if (result) {
    const correction = result.normal.multiplyScalar(result.depth);
    playerCollider.translate(correction);
    camera.position.add(correction);
  }

  clampFirstPersonToScene();
  updatePlayerColliderFromCamera();

  if (worldCollisionOctree.capsuleIntersect(playerCollider)) {
    camera.position.copy(previousPosition);
  }
}

function updatePlayerColliderFromCamera() {
  const groundY = firstPersonGroundEyeY() - firstPersonPreview.eyeHeight;
  playerCollider.start.set(
    camera.position.x,
    groundY + firstPersonPreview.collisionRadius,
    camera.position.z,
  );
  playerCollider.end.set(
    camera.position.x,
    groundY + firstPersonPreview.eyeHeight - firstPersonPreview.collisionHeadInset,
    camera.position.z,
  );
  playerCollider.radius = firstPersonPreview.collisionRadius;
}

function updateMailboxProximity() {
  if (
    !worldRoot ||
    !gameUiState.started ||
    debugActive ||
    mailboxTaskState.completed ||
    isQuestPanelOpen() ||
    mailboxTaskState.hasMailKey
  ) {
    return;
  }

  const isInRange = distanceToMailboxTask() <= mailboxProximityRadius();
  if (!isInRange) {
    mailboxTaskState.inRange = false;
    return;
  }

  // 抛下爷爷时不能独自做任务：先回去把爷爷牵过来。
  if (level4State.active && !grandpaPresentForTask()) {
    mailboxTaskState.inRange = false;
    if (performance.now() >= level4State.remindAt) {
      level4State.remindAt = performance.now() + 3200;
      grandpaSpeak('先回去把爷爷牵过来，别丢下他。', 3000);
    }
    return;
  }

  if (mailboxTaskState.inRange) {
    return;
  }

  mailboxTaskState.inRange = true;
  openMailboxQuest();
}

function updateSchoolProximity() {
  if (
    !worldRoot ||
    !gameUiState.started ||
    debugActive ||
    !mailboxTaskState.completed ||
    schoolTaskState.completed ||
    isQuestPanelOpen()
  ) {
    return;
  }

  const isInRange = distanceToSchoolTask() <= schoolProximityRadius();
  if (!isInRange) {
    schoolTaskState.inRange = false;
    return;
  }

  // 抛下爷爷时不能独自做任务：先回去把爷爷牵过来。
  if (level4State.active && !grandpaPresentForTask()) {
    schoolTaskState.inRange = false;
    if (performance.now() >= level4State.remindAt) {
      level4State.remindAt = performance.now() + 3200;
      grandpaSpeak('先回去把爷爷牵过来，别丢下他。', 3000);
    }
    return;
  }

  if (schoolTaskState.inRange) {
    return;
  }

  schoolTaskState.inRange = true;
  openSchoolQuest();
}

function updateHomeProximity() {
  if (
    !worldRoot ||
    !gameUiState.started ||
    debugActive ||
    gameUiState.grandpaLeading ||
    !schoolTaskState.completed ||
    homeTaskState.completed ||
    isQuestPanelOpen()
  ) {
    return;
  }

  const isInRange = distanceToHomeTask() <= homeProximityRadius();
  if (!isInRange) {
    homeTaskState.inRange = false;
    return;
  }

  // 到家门口但爷爷不在身边：提示先回去牵爷爷，不开送信面板（保持可重试）。
  if (level4State.active && !grandpaPresentForTask()) {
    homeTaskState.inRange = false;
    if (performance.now() >= level4State.remindAt) {
      level4State.remindAt = performance.now() + 3200;
      grandpaSpeak('到家门口啦，先回去把爷爷牵过来。', 3000);
    }
    return;
  }

  if (homeTaskState.inRange) {
    return;
  }

  homeTaskState.inRange = true;
  openDeliveryPanel();
}

function distanceToMailboxTask() {
  const marker = spaceMarkers.mailboxTask;
  const dx = camera.position.x - marker.x;
  const dz = camera.position.z - marker.z;
  return Math.hypot(dx, dz);
}

function distanceToSchoolTask() {
  const marker = spaceMarkers.schoolTask;
  const dx = camera.position.x - marker.x;
  const dz = camera.position.z - marker.z;
  return Math.hypot(dx, dz);
}

function distanceToHomeTask() {
  const marker = spaceMarkers.grandpaHomeTask;
  const dx = camera.position.x - marker.x;
  const dz = camera.position.z - marker.z;
  return Math.hypot(dx, dz);
}

function mailboxProximityRadius() {
  return 4.5;
}

function schoolProximityRadius() {
  return 4.5;
}

function homeProximityRadius() {
  return 5.2;
}

function handleGrandpaPointerDown(event) {
  if (
    event.button !== 0 ||
    debugActive ||
    isQuestPanelOpen() ||
    !grandpaRoot ||
    !pickGrandpa(event)
  ) {
    return false;
  }

  event.preventDefault();
  grandpaState.suppressNextCanvasClick = true;
  // 对话与牵手分开：有"待说的话"→语音交谈；否则切换牵手/松手陪走。
  if (pendingConversation) {
    talkToGrandpa();
    return true;
  }
  if (grandpaState.held) {
    releaseGrandpaHold('松开了爷爷的手。');
  } else {
    grandpaState.holdPointerId = event.pointerId;
    holdGrandpa();
    canvas.setPointerCapture?.(event.pointerId);
  }
  return true;
}

function talkToGrandpa() {
  const conversation = pendingConversation;
  if (!conversation) {
    return;
  }
  pendingConversation = null;
  updateTalkPrompt();
  showDialog(conversation.lines, { onComplete: conversation.onComplete });
}

function holdGrandpa() {
  grandpaState.held = true;
  grandpaState.lost = false;
  grandpaState.autoWalking = false;
  setGrandpaStatus('牵住爷爷，慢慢带他走。');
  // 全程陪走：第一次牵起爷爷的手（关卡一）就开启陪伴机制，贯穿邮局→学校→回家。
  if (!level4State.active) {
    startLevel4Companion();
  }
}

function autoSaveProgress() {
  saveGameProgress({
    level1Complete: gameUiState.level1Complete,
    mailboxCompleted: mailboxTaskState.completed,
    schoolCompleted: schoolTaskState.completed,
    homeCompleted: homeTaskState.completed,
    deliveryStage: homeTaskState.deliveryStage,
    unlockedMemoryCount: gameUiState.unlockedMemoryCount,
    endingIndex: gameUiState.endingIndex,
    savedAt: Date.now(),
  });
}

function releaseGrandpaHold(message) {
  if (!grandpaState.held) {
    return;
  }

  grandpaState.held = false;
  grandpaState.holdPointerId = null;
  setGrandpaStatus(message);
}

function loseGrandpa(message) {
  grandpaState.held = false;
  grandpaState.lost = true;
  grandpaState.holdPointerId = null;
  setGrandpaStatus(message);
}

function pickGrandpa(event) {
  const meshes = getGrandpaPickObjects();

  if (!meshes.length) {
    return false;
  }

  const rect = canvas.getBoundingClientRect();
  grandpaPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  grandpaPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  grandpaRaycaster.setFromCamera(grandpaPointer, camera);
  grandpaRaycaster.near = 0;
  grandpaRaycaster.far = grandpaInteraction.pickDistance;
  return grandpaRaycaster.intersectObjects(meshes, false).length > 0;
}

function getGrandpaPickObjects() {
  if (sceneCache.grandpaPickObjects) {
    return sceneCache.grandpaPickObjects;
  }

  const meshes = [];
  grandpaRoot?.updateWorldMatrix(true, true);
  grandpaRoot?.traverse((object) => {
    if (object.isMesh && object.visible) {
      meshes.push(object);
    }
  });
  sceneCache.grandpaPickObjects = meshes;
  return meshes;
}

function updateGrandpa(deltaSeconds) {
  if (!grandpaRoot) {
    return;
  }

  if (gameUiState.grandpaLeading) {
    updateGrandpaLead(deltaSeconds);
  } else if (isLevel4Companion()) {
    updateLevel4Companion(deltaSeconds);
  } else if (grandpaState.held) {
    updateGrandpaFollow(deltaSeconds);
  } else if (grandpaState.autoWalking) {
    updateGrandpaAutoWalk(deltaSeconds);
    companionStressTarget = 0;
    grandpaState.linked = false;
  } else {
    grandpaState.moving = false;
    companionStressTarget = 0;
    grandpaState.linked = false;
  }

  updateGrandpaAnimation(deltaSeconds);
  updateTalkPrompt();
}

function updateGrandpaAnimation(deltaSeconds) {
  if (grandpaModel.enabled) {
    updateGrandpaModelAnimation(deltaSeconds);
  } else {
    updateGrandpaProceduralAnimation(deltaSeconds);
  }
}

function updateTalkPrompt() {
  if (!talkPromptEl) {
    return;
  }
  const near = grandpaRoot
    && Math.hypot(camera.position.x - grandpaRoot.position.x, camera.position.z - grandpaRoot.position.z) <= grandpaTalkRadius;
  const show = Boolean(pendingConversation) && gameUiState.started && near && !isQuestPanelOpen();
  talkPromptEl.hidden = !show;
}

// 陪伴去饱和：每帧把画面饱和度向 companionStressTarget 缓动。
function updateCompanionStress(deltaSeconds) {
  const rate = companionStressTarget > companionStress ? 2.2 : 1.6;
  companionStress += (companionStressTarget - companionStress) * Math.min(1, deltaSeconds * rate);
  saturationPass.uniforms.saturation.value = 1 - companionStress * 0.85;
}

// L3 后角色反转：剥夺玩家移动权，爷爷牵着你走向家，相机跟在爷爷身后。
function startGrandpaLeadSequence() {
  if (gameUiState.grandpaLeading) {
    return;
  }
  gameUiState.grandpaLeading = true;
  grandpaState.held = false;
  grandpaState.autoWalking = false;
  grandpaState.lost = false;
  grandpaState.linked = true;
  grandpaLeadStartedAt = performance.now();
  grandpaLeadWalkStartedAt = 0;
  companionStressTarget = 0;
  setStatus('爷爷拉起你的手，往家走。');
}

function updateGrandpaLead(deltaSeconds) {
  companionStressTarget = 0;
  grandpaState.linked = true;

  // 等开场对白/记忆碎片弹窗关闭后，爷爷才真正开始领路。
  if (isQuestPanelOpen()) {
    grandpaState.moving = false;
    grandpaLeadWalkStartedAt = 0;
    // 绝对兜底：即使弹窗异常未关，也不让玩家被锁死。
    if (performance.now() - grandpaLeadStartedAt > 45000) {
      endGrandpaLeadSequence();
    }
    return;
  }
  if (!grandpaLeadWalkStartedAt) {
    grandpaLeadWalkStartedAt = performance.now();
  }

  const target = markerVector(spaceMarkers.grandpaHomeTask);
  moveGrandpaToward(target, grandpaInteraction.followSpeed * deltaSeconds);

  const toCam = new THREE.Vector3(
    camera.position.x - grandpaRoot.position.x,
    0,
    camera.position.z - grandpaRoot.position.z,
  );
  if (toCam.lengthSq() < 0.0001) {
    toCam.set(0, 0, 1);
  }
  toCam.normalize();
  const desired = new THREE.Vector3(
    grandpaRoot.position.x + toCam.x * grandpaLeadCameraDistance,
    firstPersonGroundEyeY(),
    grandpaRoot.position.z + toCam.z * grandpaLeadCameraDistance,
  );
  camera.position.lerp(desired, Math.min(1, deltaSeconds * 2.2));
  camera.position.y = firstPersonGroundEyeY();
  syncFirstPersonAnglesFromLook(camera.position, grandpaRoot.position);

  const arrived = Math.hypot(grandpaRoot.position.x - target.x, grandpaRoot.position.z - target.z) < 1.6;
  const timedOut = performance.now() - grandpaLeadWalkStartedAt > grandpaLeadMaxMs;
  if (arrived || timedOut) {
    endGrandpaLeadSequence();
  }
}

function endGrandpaLeadSequence() {
  if (!gameUiState.grandpaLeading) {
    return;
  }
  gameUiState.grandpaLeading = false;
  grandpaState.moving = false;
  if (!homeTaskState.completed && !homeTaskState.panelOpen) {
    openDeliveryPanel();
  }
}

function updateGrandpaAutoWalk(deltaSeconds) {
  const target = markerVector(spaceMarkers.hennessyRoad1);
  moveGrandpaToward(target, grandpaInteraction.autoWalkSpeed * deltaSeconds);

  if (grandpaRoot.position.distanceTo(target) < 0.35) {
    grandpaState.autoWalking = false;
    grandpaState.moving = false;
  }
}

function updateGrandpaFollow(deltaSeconds) {
  const target = grandpaFollowTarget();
  moveGrandpaToward(target, grandpaInteraction.followSpeed * deltaSeconds);

  // 配速差 → 灰度压力：跟得上则挽手、画面清亮；落得越远越灰，超过断裂距离才真正松手。
  const gap = grandpaRoot.position.distanceTo(target);
  const comfort = grandpaInteraction.followComfort;
  const range = Math.max(0.5, grandpaInteraction.holdBreakDistance - comfort);
  companionStressTarget = THREE.MathUtils.clamp((gap - comfort) / range, 0, 1);
  grandpaState.linked = gap < comfort + 0.6;

  if (gap > grandpaInteraction.holdBreakDistance) {
    loseGrandpa('你走得太快，爷爷的手松开了。慢下来，回去牵住他。');
  }
}

function grandpaFollowTarget() {
  const forward = new THREE.Vector3(
    -Math.sin(firstPersonInput.yaw),
    0,
    -Math.cos(firstPersonInput.yaw),
  ).normalize();
  const side = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
  return new THREE.Vector3(camera.position.x, spaceMarkers.playerSpawn.y + grandpaPreview.groundLift, camera.position.z)
    .addScaledVector(forward, grandpaInteraction.followAheadOffset)
    .addScaledVector(side, grandpaInteraction.followSideOffset);
}

// ===== 关卡四：玩家牵着爷爷一起走 =====

function isLevel4Companion() {
  return (
    level4State.active
    && !homeTaskState.completed
    && !homeTaskState.panelOpen
    && !gameUiState.grandpaLeading
  );
}

// 非阻塞气泡 + 随机对话音：造"爷爷在说话"的感觉，不冻结玩家（便于判定"抛下"）。
function grandpaSpeak(line, holdMs = 3200) {
  if (!line) {
    return;
  }
  dialogueVoice.play('爷爷', line);
  if (grandpaSayTextEl) {
    grandpaSayTextEl.textContent = line;
  }
  if (grandpaSayEl) {
    grandpaSayEl.hidden = false;
  }
  window.clearTimeout(grandpaSayTimer);
  grandpaSayTimer = window.setTimeout(() => {
    if (grandpaSayEl) {
      grandpaSayEl.hidden = true;
    }
  }, holdMs);
}

function hideGrandpaSay() {
  window.clearTimeout(grandpaSayTimer);
  if (grandpaSayEl) {
    grandpaSayEl.hidden = true;
  }
}

function pickCompanionLine(list, field) {
  if (!list.length) {
    return '';
  }
  if (list.length === 1) {
    return list[0];
  }
  let index = Math.floor(Math.random() * list.length);
  if (index === level4State[field]) {
    index = (index + 1) % list.length; // 避免连续相同
  }
  level4State[field] = index;
  return list[index];
}

function grandpaToPlayerGap() {
  return Math.hypot(
    camera.position.x - grandpaRoot.position.x,
    camera.position.z - grandpaRoot.position.z,
  );
}

// 任务前置门禁：爷爷必须在身边（牵着且不远），不能抛下爷爷独自完成任务。
function grandpaPresentForTask() {
  if (!level4State.active || !grandpaRoot) {
    return true; // 非关卡四陪伴流程（含调试入口）不拦截
  }
  if (grandpaState.lost) {
    return false;
  }
  return grandpaToPlayerGap() <= level4HoldBreakDistance + 1.5;
}

function startLevel4Companion() {
  level4State.active = true;
  grandpaState.held = true;
  grandpaState.lost = false;
  grandpaState.autoWalking = false;
  grandpaState.linked = true;
  const now = performance.now();
  level4State.talkAt = now + 9000; // 出发约 9s 后第一次路上闲聊
  level4State.remindAt = 0;
  level4State.callAt = 0;
  level4State.talking = false;
}

function abandonGrandpaLevel4() {
  grandpaState.held = false;
  grandpaState.lost = true;
  grandpaState.moving = false;
  level4State.talking = false;
  level4State.callAt = 0; // 立刻开始呼喊
  companionStressTarget = 1;
}

function updateLevel4Companion(deltaSeconds) {
  grandpaState.linked = grandpaState.held && !grandpaState.lost;

  // 弹窗（对白/记忆/暂停）打开时，爷爷原地等待，不触发提醒/闲聊/抛下。
  if (isQuestPanelOpen()) {
    grandpaState.moving = false;
    return;
  }

  const now = performance.now();

  // 抛下状态：爷爷站着持续呼喊；玩家回到 rejoinDistance 内自动重新牵上。
  if (grandpaState.lost) {
    grandpaState.moving = false;
    companionStressTarget = 1;
    faceGrandpaToward(camera.position);
    if (grandpaToPlayerGap() <= grandpaInteraction.rejoinDistance) {
      grandpaState.lost = false;
      grandpaState.held = true;
      companionStressTarget = 0;
      level4State.talkAt = now + 8000;
      grandpaSpeak(pickCompanionLine(storyCopy.dialogs.companion.reunion, 'callIndex'));
    } else if (now >= level4State.callAt) {
      level4State.callAt = now + 3200;
      grandpaSpeak(pickCompanionLine(storyCopy.dialogs.companion.calls, 'callIndex'), 3000);
    }
    return;
  }

  // 停下来说话：爷爷站定讲一句，玩家若在此时走开则视为抛下。
  if (level4State.talking) {
    grandpaState.moving = false;
    faceGrandpaToward(camera.position);
    const drift = Math.hypot(
      camera.position.x - level4State.talkAnchor.x,
      camera.position.z - level4State.talkAnchor.z,
    );
    if (drift > level4HoldBreakDistance) {
      abandonGrandpaLevel4();
      return;
    }
    if (now >= level4State.talkUntil) {
      level4State.talking = false;
      level4State.talkAt = now + 10000 + Math.random() * 6000;
    }
    return;
  }

  // 正常跟随：手机端用固定上限（按目标步频能跟上，走快会落下）；桌面用走速基准。
  const target = grandpaFollowTarget();
  const followSpeed = companionFollowSpeed();
  moveGrandpaToward(target, followSpeed * deltaSeconds);
  const gap = grandpaRoot.position.distanceTo(target);
  const comfort = grandpaInteraction.followComfort;
  const range = Math.max(0.5, level4HoldBreakDistance - comfort);
  companionStressTarget = THREE.MathUtils.clamp((gap - comfort) / range, 0, 1);

  if (gap > level4HoldBreakDistance) {
    abandonGrandpaLevel4(); // 走太远 → 抛下
    return;
  }
  if (gap > comfort + 1.1 && now >= level4State.remindAt) {
    level4State.remindAt = now + 3000; // 走太快落后 → 提醒慢一点
    grandpaSpeak(pickCompanionLine(storyCopy.dialogs.companion.slowDown, 'remindIndex'), 2600);
  }
  if (now >= level4State.talkAt && gap <= comfort + 0.8) {
    level4State.talking = true; // 到点 → 停下来说一句
    level4State.talkUntil = now + 3600;
    level4State.talkAnchor = { x: camera.position.x, z: camera.position.z };
    grandpaState.moving = false;
    grandpaSpeak(pickCompanionLine(storyCopy.dialogs.companion.chats, 'talkIndex'), 3600);
  }
}

function companionFollowSpeed() {
  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor') {
    const cadence = mobileInput.liveCadence || mobileInput.referenceCadence || CALIBRATION_TARGET_BPM;
    if (cadence <= 75) {
      return companionMobileFollowSpeed;
    }
    return companionMobileFollowSpeed * 0.86;
  }
  return firstPersonPreview.moveSpeed * 1.15;
}

function moveGrandpaToward(target, maxStep) {
  const delta = target.clone().sub(grandpaRoot.position);
  delta.y = 0;
  const distance = delta.length();
  if (distance < 0.02) {
    grandpaState.moving = false;
    return;
  }

  const step = Math.min(maxStep, distance);
  delta.normalize();
  grandpaRoot.position.addScaledVector(delta, step);
  faceGrandpaToward(grandpaRoot.position.clone().add(delta));
  grandpaState.moving = step > 0.001;
}

function markerVector(marker) {
  return new THREE.Vector3(marker.x, marker.y + grandpaPreview.groundLift, marker.z);
}

function faceGrandpaToward(target) {
  if (!grandpaRoot) {
    return;
  }

  const delta = target.clone().sub(grandpaRoot.position);
  delta.y = 0;
  if (delta.lengthSq() < 0.0001) {
    return;
  }
  grandpaRoot.rotation.y = Math.atan2(delta.x, delta.z);
}

function updateGrandpaProceduralAnimation(deltaSeconds) {
  const { parts } = grandpaRig;
  if (!parts.motion) {
    return;
  }

  const targetBlend = grandpaState.moving ? 1 : 0;
  const blendSpeed = grandpaState.moving ? 7.5 : 5.5;
  grandpaRig.walkBlend += (targetBlend - grandpaRig.walkBlend) * Math.min(1, deltaSeconds * blendSpeed);

  const walk = grandpaRig.walkBlend;
  const cycleSpeed = grandpaState.held ? 4.8 : 3.7;
  grandpaRig.phase = (grandpaRig.phase + deltaSeconds * cycleSpeed * (0.25 + walk * 0.75)) % (Math.PI * 2);

  const stride = Math.sin(grandpaRig.phase);
  const counterStride = -stride;
  const doubleStep = Math.sin(grandpaRig.phase * 2);
  const footLift = Math.max(0, doubleStep);
  const sway = Math.sin(grandpaRig.phase + Math.PI * 0.35);

  parts.motion.position.y = Math.abs(doubleStep) * 0.035 * walk;
  parts.motion.rotation.z = sway * 0.024 * walk;

  if (parts.body) {
    parts.body.rotation.x = -0.035 * walk + Math.sin(grandpaRig.phase * 2 + 0.7) * 0.012 * walk;
    parts.body.rotation.z = -sway * 0.015 * walk;
  }
  if (parts.head) {
    parts.head.rotation.x = 0.035 * walk + Math.sin(grandpaRig.phase * 2 + 1.2) * 0.01 * walk;
    parts.head.rotation.z = sway * 0.018 * walk;
  }
  if (parts.leftLeg) {
    parts.leftLeg.rotation.x = stride * 0.38 * walk;
    parts.leftLeg.rotation.z = -0.035 * walk;
    parts.leftLeg.position.y = footLift * 0.02 * walk;
  }
  if (parts.rightLeg) {
    parts.rightLeg.rotation.x = counterStride * 0.38 * walk;
    parts.rightLeg.rotation.z = 0.035 * walk;
    parts.rightLeg.position.y = Math.max(0, -doubleStep) * 0.02 * walk;
  }
  if (parts.leftArm) {
    if (grandpaState.linked) {
      // 挽手姿态：靠玩家一侧的手臂抬起挽住，停止摆动。
      parts.leftArm.rotation.x += (-0.2 - parts.leftArm.rotation.x) * Math.min(1, deltaSeconds * 6);
      parts.leftArm.rotation.z += (0.3 - parts.leftArm.rotation.z) * Math.min(1, deltaSeconds * 6);
    } else {
      parts.leftArm.rotation.x = counterStride * 0.24 * walk - 0.06;
      parts.leftArm.rotation.z = 0.1;
    }
  }
  if (parts.rightArm) {
    parts.rightArm.rotation.x = stride * 0.12 * walk - 0.03;
    parts.rightArm.rotation.z = -0.12;
  }
  if (parts.cane) {
    parts.cane.rotation.x = Math.sin(grandpaRig.phase + Math.PI * 0.4) * 0.1 * walk;
    parts.cane.rotation.z = 0.18 + Math.max(0, Math.sin(grandpaRig.phase + Math.PI)) * 0.07 * walk;
  }
}

function setGrandpaStatus(message) {
  grandpaState.statusMessage = message;
  setStatus(message);
}

function clampFirstPersonToScene() {
  const box = getVisibleContentBox(worldRoot);
  if (box.isEmpty()) {
    return;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, box.min.x + 2, box.max.x - 2);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, box.min.z + 2, box.max.z - 2);
}

function firstPersonGroundEyeY() {
  return spaceMarkers.playerSpawn.y + firstPersonPreview.eyeHeight;
}

async function loadWorldCollision() {
  const startedAt = performance.now();
  worldCollisionRoot = null;
  worldCollisionOctree = null;
  worldCollisionStats = {
    loaded: false,
    blockers: 0,
    triangles: 0,
  };

  try {
    const collision = await loader.loadAsync('/web/generated/Demo0620_1_collision.gltf');
    worldCollisionRoot = collision.scene;
    worldCollisionRoot.name = 'GeneratedUCXCollision';
    worldCollisionRoot.rotation.y = Math.PI;
    worldCollisionRoot.userData.skipStylize = true;
    worldCollisionRoot.userData.excludeFromBounds = true;
    scene.add(worldCollisionRoot);
    prepareCollisionRoot(worldCollisionRoot);

    worldCollisionOctree = new Octree().fromGraphNode(worldCollisionRoot);
    worldCollisionStats = collectCollisionStats(worldCollisionRoot);
    worldCollisionStats.loaded = true;
    performanceStats.collisionLoadMs = performance.now() - startedAt;
    console.info('World collision loaded', worldCollisionStats);
  } catch (error) {
    performanceStats.collisionLoadMs = performance.now() - startedAt;
    console.warn('World collision unavailable; falling back to scene bounds only.', error);
  }
}

function prepareCollisionRoot(root) {
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    object.userData.skipStylize = true;
    object.userData.excludeFromBounds = true;
    if (!object.isMesh) {
      return;
    }

    object.visible = false;
    object.frustumCulled = false;
  });
}

function collectCollisionStats(root) {
  const stats = {
    loaded: false,
    blockers: 0,
    triangles: 0,
  };

  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) {
      return;
    }

    stats.blockers += 1;
    stats.triangles += object.geometry.index
      ? Math.floor(object.geometry.index.count / 3)
      : Math.floor(object.geometry.attributes.position.count / 3);
  });

  return stats;
}

function initGameUi() {
  assignImage(uiElements.envelopeImage, uiAssets.mailIcon);
  if (uiElements.letterImage) {
    uiElements.letterImage.removeAttribute('src');
    uiElements.letterImage.hidden = true;
  }
  setLoadingProgress(6);
  setTask('level1');

  talkPromptEl?.addEventListener('click', (event) => {
    event.preventDefault();
    if (pendingConversation) {
      talkToGrandpa();
    }
  });

  if (uiElements.loadingStart) {
    uiElements.loadingStart.disabled = true;
    uiElements.loadingStart.addEventListener('click', startGameUi);
  }
  uiElements.calibrationStart?.addEventListener('click', handleCalibrationPrimary);
  uiElements.calibrationSkip?.addEventListener('click', () => {
    resetCalibrationWizard();
    stopMotionSensor();
    closeCalibrationScreen();
    setMobileControlMode('desktop-touch', '已跳过体感。可拖动右侧看向，连接键盘或换桌面继续。');
    releaseImmersiveMode();
    enterStartedGameplay();
  });
  uiElements.pauseButton?.addEventListener('click', showPauseScreen);
  uiElements.resumeGame?.addEventListener('click', resumeFromPauseScreen);
  uiElements.restartGame?.addEventListener('click', () => {
    stopMotionSensor();
    releaseImmersiveMode();
    window.location.reload();
  });
  uiElements.dialogNext?.addEventListener('click', advanceDialog);
  uiElements.memoryButton?.addEventListener('click', showUnlockedMemory);
  uiElements.memoryClose?.addEventListener('click', closeMemoryModal);
  uiElements.settingsButton?.addEventListener('click', showSettingsScreen);
  uiElements.settingsClose?.addEventListener('click', closeSettingsScreen);
  uiScreens.settings?.addEventListener('click', (event) => {
    const target = event.target;
    if (target === uiScreens.settings) {
      closeSettingsScreen();
      return;
    }
    const jumpButton = target?.closest?.('[data-jump-level]');
    if (jumpButton) {
      const level = Number(jumpButton.getAttribute('data-jump-level'));
      if (level >= 1 && level <= 4) {
        jumpToLevel(level);
      }
    }
  });
  uiScreens.memory?.addEventListener('click', (event) => {
    if (event.target === uiScreens.memory) {
      closeMemoryModal();
    }
  });
  uiElements.deliveryClose?.addEventListener('click', () => closeDeliveryPanel());
  uiScreens.delivery?.addEventListener('click', (event) => {
    if (event.target === uiScreens.delivery) {
      closeDeliveryPanel();
    }
  });
  uiElements.envelopeScratch?.addEventListener('pointerdown', handleScratchPointerDown);
  uiElements.envelopeScratch?.addEventListener('pointermove', handleScratchPointerMove);
  window.addEventListener('pointerup', handleScratchPointerEnd);
  window.addEventListener('pointercancel', handleScratchPointerEnd);
  uiElements.openLetter?.addEventListener('click', openGrandpaLetter);
  uiElements.signatureCanvas?.addEventListener('pointerdown', handleSignaturePointerDown);
  uiElements.signatureCanvas?.addEventListener('pointermove', handleSignaturePointerMove);
  window.addEventListener('pointerup', handleSignaturePointerEnd);
  window.addEventListener('pointercancel', handleSignaturePointerEnd);
  uiElements.submitSignature?.addEventListener('click', submitGrandpaSignature);
  uiElements.endingNext?.addEventListener('click', advanceEnding);

  if (uiElements.memoryButton) {
    uiElements.memoryButton.disabled = true;
  }
  document.body.classList.add('ui-loading');
  syncRuntimePause();
}

function assignImage(image, src) {
  if (!image || !src) {
    return;
  }
  image.decoding = 'async';
  image.src = src;
}

function setButtonLabel(button, label) {
  if (!button) {
    return;
  }
  let labelEl = button.querySelector('.ui-button-label');
  if (!labelEl && !button.querySelector('img')) {
    button.textContent = label;
    return;
  }
  if (!labelEl) {
    labelEl = document.createElement('span');
    labelEl.className = 'ui-button-label';
    button.appendChild(labelEl);
  }
  labelEl.textContent = label;
}

function setLoadingProgress(percent) {
  if (!uiElements.loadingProgress) {
    return;
  }
  const safePercent = THREE.MathUtils.clamp(percent, 0, 100);
  uiElements.loadingProgress.style.width = `${safePercent}%`;
}

function markSceneReady() {
  gameUiState.sceneReady = true;
  setLoadingProgress(100);
  if (uiElements.loadingStart) {
    uiElements.loadingStart.disabled = false;
    setButtonLabel(uiElements.loadingStart, '轻触开始');
  }
}

function markSceneLoadFailed(message) {
  setLoadingProgress(0);
  if (uiElements.loadingStart) {
    uiElements.loadingStart.disabled = true;
    setButtonLabel(uiElements.loadingStart, '加载失败');
  }
  if (uiElements.taskText) {
    uiElements.taskText.textContent = message;
  }
}

function startGameUi() {
  dialogueVoice.unlock(); // 用户手势内解锁/预热 AudioContext
  if (!gameUiState.sceneReady || gameUiState.started) {
    return;
  }
  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor' && !mobileInput.sensorListening) {
    openCalibrationScreen();
    return;
  }

  gameUiState.started = true;
  if (uiScreens.loading) {
    uiScreens.loading.hidden = true;
  }
  closeCalibrationScreen();
  document.body.classList.remove('ui-loading');
  syncRuntimePause();

  const saved = loadGameProgress();
  if (saved && saved.level1Complete) {
    restoreFromSave(saved);
  } else {
    setTask('level1');
    showDialog(storyCopy.dialogs.intro);
    pendingConversation = {
      lines: storyCopy.dialogs.holdGrandpa,
      onComplete: () => {
        gameUiState.level1Complete = true;
        setTask('level2');
        refreshObjectiveReveal();
        autoSaveProgress();
      },
    };
  }

  if (runtimeConfig.isMobile && runtimeConfig.requestedControls !== 'desktop' && mobileInput.mode !== 'sensor') {
    ensureMobileControlsReady();
  }
  queueLodLoad();
}

function enterStartedGameplay() {
  dialogueVoice.unlock(); // 移动端校准后进入游戏的手势，解锁音频
  if (gameUiState.started) {
    closeCalibrationScreen();
    syncRuntimePause();
    return;
  }
  gameUiState.started = true;
  if (uiScreens.loading) {
    uiScreens.loading.hidden = true;
  }
  closeCalibrationScreen();
  document.body.classList.remove('ui-loading');
  syncRuntimePause();

  const saved = loadGameProgress();
  if (saved && saved.level1Complete) {
    restoreFromSave(saved);
  } else {
    setTask('level1');
    showDialog(storyCopy.dialogs.intro);
    // 对话与牵手分开：开局爷爷有话要说，靠近后点击「语音交谈」才推进到邮箱任务。
    pendingConversation = {
      lines: storyCopy.dialogs.holdGrandpa,
      onComplete: () => {
        gameUiState.level1Complete = true;
        setTask('level2');
        refreshObjectiveReveal();
        autoSaveProgress();
      },
    };
  }
  queueLodLoad();
}

function restoreFromSave(saved) {
  gameUiState.level1Complete = Boolean(saved.level1Complete);
  mailboxTaskState.completed = Boolean(saved.mailboxCompleted);
  schoolTaskState.completed = Boolean(saved.schoolCompleted);
  homeTaskState.completed = Boolean(saved.homeCompleted);
  homeTaskState.deliveryStage = saved.deliveryStage && Object.values(DELIVERY_STAGE).includes(saved.deliveryStage)
    ? saved.deliveryStage
    : DELIVERY_STAGE.scratch;
  gameUiState.unlockedMemoryCount = Math.min(storyCopy.memories.length, Math.max(0, saved.unlockedMemoryCount ?? 0));
  gameUiState.endingIndex = THREE.MathUtils.clamp(Math.max(0, saved.endingIndex ?? 0), 0, storyCopy.ending.length - 1);

  if (uiElements.memoryButton) {
    uiElements.memoryButton.disabled = gameUiState.unlockedMemoryCount <= 0;
  }
  if (mailboxHotspot) {
    mailboxHotspot.visible = !mailboxTaskState.completed;
  }
  if (schoolHotspot) {
    schoolHotspot.visible = mailboxTaskState.completed && !schoolTaskState.completed;
  }
  if (homeHotspot) {
    homeHotspot.visible = schoolTaskState.completed && !homeTaskState.completed;
  }
  refreshObjectiveReveal();

  if (homeTaskState.completed) {
    placePlayerAtLevelStart(4);
    setTask('epilogue');
    renderEndingStep();
    if (uiScreens.ending) {
      uiScreens.ending.hidden = false;
    }
    syncQuestOpenClass();
    return;
  }
  if (schoolTaskState.completed) {
    placePlayerAtLevelStart(4);
    setTask('level4');
    startLevel4Companion(); // 读档续上"牵着爷爷一起走"的陪伴状态
    placeGrandpaBesidePlayer();
    setStatus('继续牵着爷爷，一起走回爷爷家。');
    return;
  }
  if (mailboxTaskState.completed) {
    placePlayerAtLevelStart(3);
    startLevel4Companion();
    placeGrandpaBesidePlayer();
    setTask('level3');
    setStatus('继续前往学校，拼回散落的旧明信片。');
    return;
  }
  placePlayerAtLevelStart(2);
  startLevel4Companion();
  placeGrandpaBesidePlayer();
  setTask('level2');
  setStatus('继续前往2号信箱，替爷爷投信。');
}

function syncRuntimePause() {
  performanceStats.paused = Boolean(
    performanceStats.contextLost ||
    document.hidden ||
    gameUiState.pausedByUi ||
    !gameUiState.started,
  );
  if (!performanceStats.paused) {
    firstPersonInput.lastFrameTime = performance.now();
  }
}

function setTask(taskKey, customText) {
  const copy = Array.isArray(taskKey)
    ? taskKey
    : storyCopy.tasks[taskKey] ?? ['任务', customText ?? '继续陪爷爷送信'];

  if (uiElements.taskLevel) {
    uiElements.taskLevel.textContent = copy[0];
  }
  if (uiElements.taskText) {
    uiElements.taskText.textContent = customText ?? copy[1];
  }
  if (uiScreens.taskToast) {
    uiScreens.taskToast.hidden = false;
  }
}

function showDialog(lines, options = {}) {
  const normalizedLines = lines
    .map((line) => (Array.isArray(line) ? line : ['小满', line]))
    .filter((line) => line[1]);
  if (!normalizedLines.length || !uiScreens.dialog) {
    options.onComplete?.();
    return;
  }

  gameUiState.dialogLines = normalizedLines;
  gameUiState.dialogIndex = 0;
  gameUiState.pendingDialog = options.onComplete ?? null;
  hideGrandpaSay(); // 模态对白打开时收起路上气泡，避免重叠
  uiScreens.dialog.hidden = false;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  renderDialogLine();
  syncQuestOpenClass();
}

function renderDialogLine() {
  const line = gameUiState.dialogLines[gameUiState.dialogIndex];
  if (!line) {
    return;
  }
  if (uiElements.dialogSpeaker) {
    uiElements.dialogSpeaker.textContent = line[0];
  }
  if (uiElements.dialogText) {
    uiElements.dialogText.textContent = line[1];
  }
  // 角色开口时播放随机对话音碎片（文字仍正常显示中文，音频不逐字对应）。
  dialogueVoice.play(line[0], line[1]);
  if (uiElements.dialogNext) {
    setButtonLabel(
      uiElements.dialogNext,
      gameUiState.dialogIndex >= gameUiState.dialogLines.length - 1 ? '收起' : '继续',
    );
  }
}

function advanceDialog() {
  dialogueVoice.stop(); // 停掉上一句的碎片音，再切下一句
  if (!gameUiState.dialogLines.length) {
    closeDialog();
    return;
  }

  gameUiState.dialogIndex += 1;
  if (gameUiState.dialogIndex < gameUiState.dialogLines.length) {
    renderDialogLine();
    return;
  }
  closeDialog();
}

function closeDialog() {
  dialogueVoice.stop(); // 对话收起时停掉残余碎片音
  if (uiScreens.dialog) {
    uiScreens.dialog.hidden = true;
  }
  gameUiState.dialogLines = [];
  gameUiState.dialogIndex = 0;
  const onComplete = gameUiState.pendingDialog;
  gameUiState.pendingDialog = null;
  syncQuestOpenClass();
  onComplete?.();
}

function unlockMemories(count) {
  gameUiState.unlockedMemoryCount = Math.max(
    gameUiState.unlockedMemoryCount,
    Math.min(storyCopy.memories.length, count),
  );
  if (uiElements.memoryButton) {
    uiElements.memoryButton.disabled = gameUiState.unlockedMemoryCount <= 0;
  }
}

function showUnlockedMemory() {
  if (gameUiState.unlockedMemoryCount <= 0) {
    return;
  }
  const memory = storyCopy.memories[gameUiState.activeMemoryIndex % gameUiState.unlockedMemoryCount];
  gameUiState.activeMemoryIndex = (gameUiState.activeMemoryIndex + 1) % gameUiState.unlockedMemoryCount;
  showMemory(memory);
}

function showMemory(memory) {
  if (!memory || !uiScreens.memory) {
    return;
  }
  assignImage(uiElements.memoryImage, memory.src);
  if (uiElements.memoryCaption) {
    uiElements.memoryCaption.textContent = memory.caption;
  }
  uiScreens.memory.hidden = false;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  syncQuestOpenClass();
}

function closeMemoryModal() {
  if (uiScreens.memory) {
    uiScreens.memory.hidden = true;
  }
  syncQuestOpenClass();
}

function showPauseScreen() {
  if (!gameUiState.started || (uiScreens.ending && !uiScreens.ending.hidden)) {
    return;
  }
  gameUiState.pausedByUi = true;
  syncRuntimePause();
  firstPersonInput.keys.clear();
  mobileInput.activeMoveButtons.clear();
  updateMobileJoystickVector();
  document.exitPointerLock?.();
  releaseImmersiveMode();
  if (uiScreens.pause) {
    uiScreens.pause.hidden = false;
  }
  syncQuestOpenClass();
}

function resumeFromPauseScreen() {
  gameUiState.pausedByUi = false;
  if (uiScreens.pause) {
    uiScreens.pause.hidden = true;
  }
  syncRuntimePause();
  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor') {
    enterImmersiveMode().catch(() => {});
  }
  syncQuestOpenClass();
}

// ===== 设置 · 关卡选择（进度可逆，从所选关卡起点重新开始） =====
function showSettingsScreen() {
  if (!gameUiState.started || (uiScreens.ending && !uiScreens.ending.hidden)) {
    return;
  }
  gameUiState.pausedByUi = true;
  syncRuntimePause();
  firstPersonInput.keys.clear();
  mobileInput.activeMoveButtons.clear();
  updateMobileJoystickVector();
  document.exitPointerLock?.();
  releaseImmersiveMode();
  if (uiScreens.settings) {
    uiScreens.settings.hidden = false;
  }
  syncQuestOpenClass();
}

function closeSettingsScreen() {
  gameUiState.pausedByUi = false;
  if (uiScreens.settings) {
    uiScreens.settings.hidden = true;
  }
  syncRuntimePause();
  syncQuestOpenClass();
}

function placeGrandpaBesidePlayer() {
  if (!grandpaRoot) {
    return;
  }
  grandpaRoot.position.copy(grandpaFollowTarget());
  faceGrandpaToward(camera.position);
}

function placePlayerAtLevelStart(level) {
  const start = LEVEL_STARTS[level] ?? LEVEL_STARTS[1];
  const marker = spaceMarkers[start.marker] ?? spaceMarkers.playerSpawn;
  const lookAt = spaceMarkers[start.lookAt] ?? spaceMarkers.mailboxTask;
  const eye = new THREE.Vector3(
    marker.x,
    marker.y + firstPersonPreview.eyeHeight,
    marker.z,
  );
  const target = markerVector(lookAt);
  target.y = eye.y - firstPersonPreview.lookDown;
  camera.position.copy(eye);
  camera.near = 0.05;
  camera.updateProjectionMatrix();
  syncFirstPersonAnglesFromLook(eye, target);
  updatePlayerColliderFromCamera();
}

function resetProgressToLevel(level) {
  if (!gameUiState.started) {
    return;
  }
  const normalizedLevel = THREE.MathUtils.clamp(Math.round(level), 1, 4);

  // 关闭所有任务面板 / 弹窗
  closeMemoryModal();
  closeDeliveryPanel();
  closeMailboxQuest();
  closeSchoolQuest();
  closeListenTask();
  hideGrandpaSay();
  if (uiScreens.ending) {
    uiScreens.ending.hidden = true;
  }
  if (uiScreens.pause) {
    uiScreens.pause.hidden = true;
  }
  if (uiScreens.settings) {
    uiScreens.settings.hidden = true;
  }
  gameUiState.pausedByUi = false;
  gameUiState.dialogLines = [];
  gameUiState.dialogIndex = 0;
  gameUiState.pendingDialog = null;
  pendingConversation = null;
  window.clearTimeout(modeRevertTimer);
  modeRevertTimer = 0;

  // 进度旗标（关卡一=全 false；逐关累加）
  gameUiState.level1Complete = normalizedLevel >= 2;
  mailboxTaskState.completed = normalizedLevel >= 3;
  schoolTaskState.completed = normalizedLevel >= 4;
  homeTaskState.completed = false;
  gameUiState.grandpaLeading = false;
  gameUiState.endingIndex = 0;
  gameUiState.unlockedMemoryCount = normalizedLevel >= 4 ? 4 : normalizedLevel >= 3 ? 1 : 0;
  gameUiState.activeMemoryIndex = 0;
  if (uiElements.memoryButton) {
    uiElements.memoryButton.disabled = gameUiState.unlockedMemoryCount <= 0;
  }

  // transient 子状态清零
  mailboxTaskState.panelOpen = false;
  mailboxTaskState.hasMailKey = false;
  mailboxTaskState.inRange = false;
  mailboxTaskState.timeline = normalizedLevel >= 3 ? 'past' : 'now';
  schoolTaskState.panelOpen = false;
  schoolTaskState.selectedTile = null;
  schoolTaskState.placements = Array(schoolSortAnswer.length).fill(null);
  schoolTaskState.inRange = false;
  homeTaskState.panelOpen = false;
  homeTaskState.inRange = false;
  homeTaskState.deliveryStage = DELIVERY_STAGE.scratch;
  homeTaskState.scratchProgress = 0;
  homeTaskState.scratchComplete = false;
  homeTaskState.letterOpen = false;
  homeTaskState.signed = false;
  listenTaskState.active = false;
  listenTaskState.holding = false;
  listenTaskState.progress = 0;
  listenTaskState.completed = normalizedLevel >= 3; // 邮局的"倾听"小任务：到学校及以后视为已完成

  // 渲染模式回到"正常爷爷"
  setMode('texture');

  placePlayerAtLevelStart(normalizedLevel);
  mobileInput.queuedStepDistance = 0;
  mobileInput.stepTimes = [];
  mobileInput.liveCadence = 0;
  companionStress = 0;
  companionStressTarget = 0;

  // 爷爷与全程陪走
  level4State.active = false;
  grandpaState.lost = false;
  if (normalizedLevel === 1) {
    // 还没牵手：爷爷在自己出生点等你来牵，重排关卡一对话。
    grandpaState.held = false;
    grandpaState.autoWalking = true;
    grandpaState.linked = false;
    placeGrandpaAtSpawn();
    pendingConversation = {
      lines: storyCopy.dialogs.holdGrandpa,
      onComplete: () => {
        gameUiState.level1Complete = true;
        setTask('level2');
        refreshObjectiveReveal();
        autoSaveProgress();
      },
    };
    setTask('level1');
  } else {
    // 已牵手：爷爷在身边，开启全程陪走。
    pendingConversation = null;
    startLevel4Companion();
    placeGrandpaBesidePlayer();
    setTask(normalizedLevel === 2 ? 'level2' : normalizedLevel === 3 ? 'level3' : 'level4');
  }

  // 热点可见性（与 restoreFromSave 一致）
  if (mailboxHotspot) {
    mailboxHotspot.visible = !mailboxTaskState.completed;
  }
  if (schoolHotspot) {
    schoolHotspot.visible = mailboxTaskState.completed && !schoolTaskState.completed;
  }
  if (homeHotspot) {
    homeHotspot.visible = schoolTaskState.completed && !homeTaskState.completed;
  }
  refreshObjectiveReveal();
  autoSaveProgress();

  closeSettingsScreen();
  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor') {
    enterImmersiveMode().catch(() => {});
  }
  setStatus(sceneReadyStatus());
}

// 把进度拉回到指定关卡起点：清理状态、回指定关卡起点、按需重建陪走，然后存档。不刷新页面。
function jumpToLevel(level) {
  resetProgressToLevel(level);
}

function syncQuestOpenClass() {
  document.body.classList.toggle('quest-open', isQuestPanelOpen());
}

function openDeliveryPanel() {
  if (homeTaskState.completed || !schoolTaskState.completed) {
    return;
  }
  // 不能抛下爷爷独自送信：必须牵着爷爷一起到家门口。
  if (!grandpaPresentForTask()) {
    grandpaSpeak('别急着进去，先把爷爷牵过来，一起到家门口。', 3200);
    return;
  }

  level4State.active = false; // 进入送信面板，结束陪走阶段
  hideGrandpaSay();
  homeTaskState.panelOpen = true;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  setTask('level4');
  resetDeliveryPanel();
  if (uiScreens.delivery) {
    uiScreens.delivery.hidden = false;
  }
  syncQuestOpenClass();
  setStatus('爷爷家送信：擦净信封并签收。');
}

function closeDeliveryPanel(message) {
  homeTaskState.panelOpen = false;
  homeTaskState.inRange = !homeTaskState.completed && worldRoot && distanceToHomeTask() <= homeProximityRadius();
  if (uiScreens.delivery) {
    uiScreens.delivery.hidden = true;
  }
  firstPersonInput.keys.clear();
  syncQuestOpenClass();

  if (message) {
    setStatus(message);
  } else if (homeTaskState.completed) {
    setStatus('爷爷家送信完成。');
  } else if (worldRoot) {
    setStatus(sceneReadyStatus());
  }
}

function resetDeliveryPanel() {
  homeTaskState.deliveryStage = DELIVERY_STAGE.scratch;
  homeTaskState.scratchProgress = 0;
  homeTaskState.scratchComplete = false;
  homeTaskState.letterOpen = false;
  homeTaskState.signed = false;
  gameUiState.lastScratchPoint = null;
  gameUiState.lastSignaturePoint = null;
  renderDeliveryStage(DELIVERY_STAGE.scratch);
}

function renderDeliveryStage(stage = homeTaskState.deliveryStage) {
  homeTaskState.deliveryStage = stage;
  const isScratch = stage === DELIVERY_STAGE.scratch;
  const isRecipient = stage === DELIVERY_STAGE.recipient;
  const isLetter = stage === DELIVERY_STAGE.letter || stage === DELIVERY_STAGE.signature || stage === DELIVERY_STAGE.done;
  const isSignature = stage === DELIVERY_STAGE.signature || stage === DELIVERY_STAGE.done;

  if (uiElements.deliveryHint) {
    if (stage === DELIVERY_STAGE.scratch) {
      uiElements.deliveryHint.textContent = '擦掉信封上的时间污痕';
    } else if (stage === DELIVERY_STAGE.recipient) {
      uiElements.deliveryHint.textContent = '信封上露出了收件人：小满 启';
    } else {
      uiElements.deliveryHint.textContent = '读完爷爷的信，在签收单上写下名字';
    }
  }
  if (uiElements.envelopeScratch) {
    uiElements.envelopeScratch.hidden = isLetter;
  }
  if (uiElements.recipientReveal) {
    uiElements.recipientReveal.hidden = !isRecipient;
  }
  if (uiElements.openLetter) {
    uiElements.openLetter.hidden = !isRecipient;
  }
  if (uiElements.letterImage) {
    if (isLetter) {
      if (!uiElements.letterImage.getAttribute('src')) {
        assignImage(uiElements.letterImage, uiAssets.letterGrandpa);
      }
      uiElements.letterImage.hidden = false;
    } else {
      uiElements.letterImage.hidden = true;
      uiElements.letterImage.removeAttribute('src');
    }
  }
  if (uiElements.signatureArea) {
    uiElements.signatureArea.hidden = !isSignature;
  }
  if (uiElements.scratchCanvas) {
    uiElements.scratchCanvas.hidden = !isScratch;
    if (isScratch) {
      requestAnimationFrame(prepareScratchCanvas);
    }
  }
}

function prepareScratchCanvas() {
  const canvasEl = uiElements.scratchCanvas;
  const ctx = resizeCanvasToDisplaySize(canvasEl);
  if (!ctx) {
    return;
  }

  const width = canvasEl.clientWidth;
  const height = canvasEl.clientHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(78, 67, 50, 0.68)';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255, 250, 232, 0.2)';
  ctx.lineWidth = 2;
  for (let x = -height; x < width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 250, 232, 0.72)';
  ctx.font = '900 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('擦拭信封', width / 2, height / 2);
}

function handleScratchPointerDown(event) {
  if (!homeTaskState.panelOpen || homeTaskState.scratchComplete) {
    return;
  }
  gameUiState.scratchDrawing = true;
  gameUiState.lastScratchPoint = null;
  try {
    uiElements.envelopeScratch?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic QA events do not always have an active pointer to capture.
  }
  scratchEnvelopeAt(event);
  event.preventDefault();
}

function handleScratchPointerMove(event) {
  if (!gameUiState.scratchDrawing || homeTaskState.scratchComplete) {
    return;
  }
  scratchEnvelopeAt(event);
  event.preventDefault();
}

function handleScratchPointerEnd() {
  gameUiState.scratchDrawing = false;
  gameUiState.lastScratchPoint = null;
}

function scratchEnvelopeAt(event) {
  const canvasEl = uiElements.scratchCanvas;
  const ctx = getCanvasContext(canvasEl);
  if (!ctx) {
    return;
  }

  const point = canvasPoint(canvasEl, event);
  const previous = gameUiState.lastScratchPoint ?? point;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 42;
  ctx.beginPath();
  ctx.moveTo(previous.x, previous.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(point.x, point.y, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  gameUiState.lastScratchPoint = point;
  homeTaskState.scratchProgress = measureTransparentCanvasRatio(canvasEl);
  if (homeTaskState.scratchProgress >= 0.38) {
    completeEnvelopeScratch();
  }
}

function completeEnvelopeScratch() {
  if (homeTaskState.scratchComplete) {
    return;
  }
  homeTaskState.scratchComplete = true;
  renderDeliveryStage(DELIVERY_STAGE.recipient);
}

function openGrandpaLetter() {
  if (!homeTaskState.scratchComplete) {
    return;
  }
  homeTaskState.letterOpen = true;
  renderDeliveryStage(DELIVERY_STAGE.signature);
  requestAnimationFrame(prepareSignatureCanvas);
}

function prepareSignatureCanvas() {
  const canvasEl = uiElements.signatureCanvas;
  const ctx = resizeCanvasToDisplaySize(canvasEl);
  if (!ctx) {
    return;
  }
  const width = canvasEl.clientWidth;
  const height = canvasEl.clientHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fffdf5';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(32, 23, 15, 0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(18, height * 0.68);
  ctx.lineTo(width - 18, height * 0.68);
  ctx.stroke();
  ctx.fillStyle = 'rgba(32, 23, 15, 0.36)';
  ctx.font = '800 13px system-ui, sans-serif';
  ctx.fillText('请在此签收', 18, height * 0.68 - 10);
}

function drawSignaturePoint(point) {
  const canvasEl = uiElements.signatureCanvas;
  const ctx = getCanvasContext(canvasEl);
  if (!ctx || !point) {
    return;
  }

  ctx.fillStyle = '#20170f';
  ctx.beginPath();
  ctx.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
  ctx.fill();
}

function handleSignaturePointerDown(event) {
  if (!homeTaskState.panelOpen || !homeTaskState.letterOpen) {
    return;
  }
  const point = canvasPoint(uiElements.signatureCanvas, event);
  gameUiState.signatureDrawing = true;
  gameUiState.lastSignaturePoint = point;
  try {
    uiElements.signatureCanvas?.setPointerCapture?.(event.pointerId);
  } catch {
    // Synthetic QA events do not always have an active pointer to capture.
  }
  drawSignaturePoint(point);
  homeTaskState.signed = true;
  event.preventDefault();
}

function handleSignaturePointerMove(event) {
  if (!gameUiState.signatureDrawing || !homeTaskState.letterOpen) {
    return;
  }
  const canvasEl = uiElements.signatureCanvas;
  const ctx = getCanvasContext(canvasEl);
  if (!ctx) {
    return;
  }
  const point = canvasPoint(canvasEl, event);
  const previous = gameUiState.lastSignaturePoint ?? point;
  ctx.strokeStyle = '#20170f';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(previous.x, previous.y);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  gameUiState.lastSignaturePoint = point;
  homeTaskState.signed = true;
  event.preventDefault();
}

function handleSignaturePointerEnd() {
  gameUiState.signatureDrawing = false;
  gameUiState.lastSignaturePoint = null;
}

function submitGrandpaSignature() {
  if (!homeTaskState.letterOpen) {
    return;
  }
  if (!homeTaskState.signed) {
    if (uiElements.deliveryHint) {
      uiElements.deliveryHint.textContent = '请先在签收单上写下名字';
    }
    return;
  }
  completeHomeTask();
}

function completeHomeTask() {
  homeTaskState.completed = true;
  homeTaskState.panelOpen = false;
  homeTaskState.inRange = false;
  homeTaskState.deliveryStage = DELIVERY_STAGE.done;
  if (homeHotspot) {
    homeHotspot.visible = false;
  }
  closeDeliveryPanel('爷爷家送信完成。');
  setTask('epilogue');
  showDialog(storyCopy.dialogs.deliveryDone, { onComplete: showEndingScreen });
  refreshObjectiveReveal();
  autoSaveProgress();
}

function showEndingScreen() {
  gameUiState.endingIndex = 0;
  renderEndingStep();
  if (uiScreens.ending) {
    uiScreens.ending.hidden = false;
  }
  syncQuestOpenClass();
}

function advanceEnding() {
  if (gameUiState.endingIndex < storyCopy.ending.length - 1) {
    gameUiState.endingIndex += 1;
    renderEndingStep();
    autoSaveProgress();
    return;
  }
  stopMotionSensor();
  releaseImmersiveMode();
  clearGameProgress();
  window.location.reload();
}

function renderEndingStep() {
  const ending = storyCopy.ending[gameUiState.endingIndex] ?? storyCopy.ending[0];
  uiElements.endingFrame?.setAttribute('data-ending-step', String(gameUiState.endingIndex));
  if (uiElements.endingArt && Array.isArray(uiAssets.endingArt)) {
    const artSrc = uiAssets.endingArt[gameUiState.endingIndex] ?? uiAssets.endingArt[0];
    if (artSrc && !uiElements.endingArt.src.endsWith(artSrc)) {
      uiElements.endingArt.src = artSrc;
    }
  }
  // 结语海报(PNG)已把全部文案烤进图里，这里不再叠加 HTML 文字，避免与海报重复。
  if (uiElements.endingKicker) {
    uiElements.endingKicker.hidden = true;
  }
  if (uiElements.endingTitle) {
    uiElements.endingTitle.hidden = true;
  }
  if (uiElements.endingText) {
    uiElements.endingText.hidden = true;
  }
  if (uiElements.endingNext) {
    setButtonLabel(uiElements.endingNext, ending.button);
  }
  // 重新触发分段入场动画：导语 → 标题 → 正文 → 按钮 依次淡入上移。
  if (uiElements.endingCopy) {
    uiElements.endingCopy.classList.remove('ending-reveal');
    void uiElements.endingCopy.offsetWidth;
    uiElements.endingCopy.classList.add('ending-reveal');
  }
}

function resizeCanvasToDisplaySize(canvasEl) {
  if (!canvasEl) {
    return null;
  }
  const rect = canvasEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvasEl.width !== width || canvasEl.height !== height) {
    canvasEl.width = width;
    canvasEl.height = height;
  }
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function getCanvasContext(canvasEl) {
  if (!canvasEl) {
    return null;
  }
  const ctx = canvasEl.getContext('2d');
  if (!ctx) {
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function canvasPoint(canvasEl, event) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function measureTransparentCanvasRatio(canvasEl) {
  const ctx = canvasEl?.getContext('2d', { willReadFrequently: true });
  if (!ctx || !canvasEl.width || !canvasEl.height) {
    return 0;
  }
  const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
  let transparent = 0;
  let total = 0;
  for (let index = 3; index < data.length; index += 32) {
    total += 1;
    if (data[index] < 20) {
      transparent += 1;
    }
  }
  return total ? transparent / total : 0;
}

function initMailboxQuest() {
  questClose?.addEventListener('click', () => closeMailboxQuest());
  mailboxQuestPanel?.addEventListener('click', (event) => {
    if (event.target === mailboxQuestPanel) {
      closeMailboxQuest();
    }
  });
  propertyItems.forEach((item) => {
    item.addEventListener('click', () => handlePropertyItemClick(item.dataset.propertyItem));
  });
}

function setStoryTimeline(timeline, options = {}) {
  if (!propertyAssets[timeline]) {
    return;
  }

  mailboxTaskState.timeline = timeline;
  const assets = propertyAssets[timeline];
  applyPropertyAsset(propertyBag, assets.bag);
  for (const [itemId, image] of Object.entries(propertyImages)) {
    applyPropertyAsset(image, assets[itemId]);
  }

  const nextMode = timeline === 'past' ? 'palette' : 'texture';
  if (options.syncMode !== false && mode !== nextMode) {
    setMode(nextMode);
  }
  updateQuestHint();
}

function loadCurrentMailboxAssets() {
  const assets = propertyAssets[mailboxTaskState.timeline];
  if (!assets) {
    return;
  }

  applyPropertyAsset(propertyBag, assets.bag);
  for (const [itemId, image] of Object.entries(propertyImages)) {
    applyPropertyAsset(image, assets[itemId]);
  }
}

function applyPropertyAsset(image, src) {
  if (!image || !src) {
    return;
  }

  const requestedSrc = typeof src === 'string' ? src : src.src;
  const fallbackSrc = typeof src === 'string' ? propertyAssetFallbacks.get(src) : src.fallback;
  image.dataset.requestedSrc = requestedSrc;
  image.onerror = () => {
    const fallback = fallbackSrc ?? propertyAssetFallbacks.get(requestedSrc);
    if (fallback && image.dataset.requestedSrc === requestedSrc && image.src !== fallback) {
      image.src = fallback;
    }
  };
  image.src = requestedSrc;
}

function openMailboxQuest() {
  if (mailboxTaskState.completed) {
    return;
  }

  if (mailboxTaskState.hasMailKey) {
    completeMailboxTask();
    return;
  }

  mailboxTaskState.panelOpen = true;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  setTask('level2');
  loadCurrentMailboxAssets();
  updateQuestHint();

  if (mailboxQuestPanel) {
    mailboxQuestPanel.hidden = false;
  }
  syncQuestOpenClass();
  setStatus(mailboxTaskState.timeline === 'past' ? '过去的邮箱：找到2号信箱钥匙。' : '邮箱任务：替爷爷投信。');
}

function closeMailboxQuest(message) {
  mailboxTaskState.panelOpen = false;
  if (mailboxQuestPanel) {
    mailboxQuestPanel.hidden = true;
  }
  syncQuestOpenClass();
  firstPersonInput.keys.clear();

  if (message) {
    setStatus(message);
  } else if (mailboxTaskState.completed) {
    setStatus('邮箱任务完成。');
  } else if (mailboxTaskState.hasMailKey) {
    setStatus('已找到2号信箱钥匙，点击邮箱完成投递。');
  } else if (worldRoot) {
    setStatus(sceneReadyStatus());
  }
}

function handlePropertyItemClick(itemId) {
  if (mailboxTaskState.completed) {
    closeMailboxQuest('邮箱任务完成。');
    return;
  }

  if (itemId === 'mail') {
    if (mailboxTaskState.timeline === 'now') {
      // 点击信件回到过去：世界切到白天色表（剧情记忆色）。
      window.clearTimeout(modeRevertTimer);
      transitionToMode('palette', 800);
      setStoryTimeline('past');
      setStatus('过去的邮箱：找到2号信箱钥匙。');
      return;
    }

    updateQuestHint('这封信把你带回了过去。');
    return;
  }

  if (itemId === 'key1' || itemId === 'key2') {
    updateQuestHint('不是这把钥匙。');
    return;
  }

  if (itemId === 'key3') {
    if (mailboxTaskState.timeline !== 'past') {
      updateQuestHint('先查看信件，回到过去。');
      return;
    }

    mailboxTaskState.hasMailKey = true;
    updateQuestHint('找到了2号信箱钥匙。');
    mailboxTaskState.inRange = false;
    closeMailboxQuest('已找到2号信箱钥匙，点击邮箱完成投递。');
  }
}

function completeMailboxTask() {
  if (mailboxTaskState.completed) {
    return;
  }

  // L2 倾听节拍：在真正完成投递前，先长按听完爷爷重复的故事。
  if (!listenTaskState.completed) {
    openListenTask();
    return;
  }

  mailboxTaskState.completed = true;
  mailboxTaskState.panelOpen = false;
  if (mailboxHotspot) {
    mailboxHotspot.visible = false;
  }
  closeMailboxQuest('信已经送到了，谢谢您。');
  unlockMemories(1);
  setTask('level3');
  showDialog(storyCopy.dialogs.mailboxDone);
  refreshObjectiveReveal();
  scheduleModeRevert(10000, 5000); // 邮箱完成 10s 后用 5s 渐变回贴图平涂
  autoSaveProgress();
}

function initListenTask() {
  const button = uiElements.listenButton;
  if (!button) {
    return;
  }
  const start = (event) => {
    event.preventDefault();
    startListenHold();
  };
  const stop = (event) => {
    event.preventDefault();
    stopListenHold();
  };
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointerleave', stop);
  button.addEventListener('pointercancel', stop);
}

function openListenTask() {
  listenTaskState.active = true;
  listenTaskState.holding = false;
  listenTaskState.progress = 0;
  if (mailboxQuestPanel) {
    mailboxQuestPanel.hidden = true;
  }
  mailboxTaskState.panelOpen = false;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  setTask('level2');
  renderListenProgress();
  updateListenStory();
  updateListenHint('按住"倾听"不要松手，耐心听完三遍。');
  if (uiScreens.listen) {
    uiScreens.listen.hidden = false;
  }
  syncQuestOpenClass();
  setStatus('倾听：长按听爷爷把话讲完。');
}

function closeListenTask() {
  listenTaskState.active = false;
  listenTaskState.holding = false;
  if (uiScreens.listen) {
    uiScreens.listen.hidden = true;
  }
  syncQuestOpenClass();
}

function startListenHold() {
  if (!listenTaskState.active || listenTaskState.completed) {
    return;
  }
  listenTaskState.holding = true;
  listenTaskState.timer = performance.now();
  updateListenHint('听着……别松手。');
}

function stopListenHold() {
  if (!listenTaskState.active || !listenTaskState.holding || listenTaskState.completed) {
    return;
  }
  listenTaskState.holding = false;
  if (listenTaskState.progress < 1) {
    // 松手会让爷爷愣住——内疚反馈，进度回退。
    listenTaskState.progress = Math.max(0, listenTaskState.progress - 0.34);
    renderListenProgress();
    updateListenStory();
    updateListenHint('你松手了，爷爷愣了一下……再陪他听一遍。');
  }
}

function updateListenTask(deltaSeconds) {
  if (!listenTaskState.active || !listenTaskState.holding || listenTaskState.completed) {
    return;
  }
  listenTaskState.progress = Math.min(1, listenTaskState.progress + (deltaSeconds * 1000) / listenDurationMs);
  renderListenProgress();
  updateListenStory();
  if (listenTaskState.progress >= 1) {
    completeListenTask();
  }
}

function renderListenProgress() {
  if (uiElements.listenMeter) {
    uiElements.listenMeter.style.width = `${Math.round(listenTaskState.progress * 100)}%`;
  }
}

function updateListenStory() {
  const lines = storyCopy.dialogs.listenStory;
  if (!uiElements.listenStory || !Array.isArray(lines) || !lines.length) {
    return;
  }
  const index = Math.min(lines.length - 1, Math.floor(listenTaskState.progress * lines.length));
  const line = lines[index];
  const text = Array.isArray(line) ? line[1] : line;
  if (uiElements.listenStory.textContent !== text) {
    uiElements.listenStory.textContent = text;
  }
}

function updateListenHint(message) {
  if (uiElements.listenHint) {
    uiElements.listenHint.textContent = message;
  }
}

function completeListenTask() {
  if (listenTaskState.completed) {
    return;
  }
  listenTaskState.completed = true;
  listenTaskState.holding = false;
  closeListenTask();
  completeMailboxTask();
}

function updateQuestHint(message) {
  if (!questHint) {
    return;
  }

  if (message) {
    questHint.textContent = message;
    return;
  }

  if (mailboxTaskState.completed) {
    questHint.textContent = '邮箱任务已完成。';
  } else if (mailboxTaskState.hasMailKey) {
    questHint.textContent = '已经找到2号信箱钥匙，点击邮箱完成投递。';
  } else if (mailboxTaskState.timeline === 'past') {
    questHint.textContent = '过去：根据门牌、姓名或旧标签找到2号信箱钥匙。';
  } else {
    questHint.textContent = '邮箱任务：找到2号信箱，替爷爷投信。';
  }
}

function createMailboxHotspot() {
  if (mailboxHotspot) {
    scene.remove(mailboxHotspot);
  }

  const marker = spaceMarkers.mailboxTask;
  const group = createTaskHotspot('MailboxTaskHotspot', marker, 0xffd15b, 'mailboxHotspot');
  mailboxHotspot = group;
  scene.add(mailboxHotspot);
}

function createTaskHotspot(name, marker, color, userDataKey) {
  const group = new THREE.Group();
  group.name = name;
  group.userData.skipStylize = true;
  group.userData.excludeFromBounds = true;
  group.position.set(marker.x, marker.y + 2.2, marker.z);

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.35, 24, 16),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.34,
      depthTest: true,
      toneMapped: false,
    }),
  );
  sphere.name = `${name}Sphere`;
  sphere.userData[userDataKey] = true;
  group.add(sphere);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.62, 1.9, 32),
    new THREE.MeshBasicMaterial({
      color: 0x11100d,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthTest: true,
      toneMapped: false,
    }),
  );
  ring.name = `${name}Ring`;
  ring.userData[userDataKey] = true;
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  return group;
}

function pickMailboxTask(event) {
  if (!mailboxHotspot || mailboxTaskState.completed || !mailboxHotspot.visible) {
    return false;
  }

  const maxDistance = 52;
  if (camera.position.distanceTo(mailboxHotspot.position) > maxDistance) {
    return false;
  }

  if (event) {
    const rect = canvas.getBoundingClientRect();
    mailboxPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mailboxPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  } else {
    mailboxPointer.set(0, 0);
  }

  mailboxRaycaster.setFromCamera(mailboxPointer, camera);
  mailboxRaycaster.near = 0;
  mailboxRaycaster.far = maxDistance;
  const hits = mailboxRaycaster.intersectObjects(mailboxHotspot.children, false);
  return hits.some((hit) => hit.object?.userData.mailboxHotspot);
}

function canCompleteMailboxTask(event) {
  if (!mailboxTaskState.hasMailKey || mailboxTaskState.completed) {
    return false;
  }

  return distanceToMailboxTask() <= mailboxProximityRadius() || pickMailboxTask(event);
}

function initSchoolQuest() {
  schoolQuestClose?.addEventListener('click', () => closeSchoolQuest());
  schoolQuestPanel?.addEventListener('click', (event) => {
    if (event.target === schoolQuestPanel) {
      closeSchoolQuest();
    }
  });
  schoolSortSources.forEach((source) => {
    source.addEventListener('click', () => selectSchoolSortTile(source.dataset.schoolSortTile));
  });
  schoolSortSlots.forEach((slot) => {
    slot.addEventListener('click', () => placeSelectedSchoolSortTile(Number(slot.dataset.schoolSortSlot)));
  });
  schoolSortSubmit?.addEventListener('click', submitSchoolSort);
  schoolSortReset?.addEventListener('click', resetSchoolSort);
  updateSchoolSortHint('把散落的旧明信片拼回原来的画面。');
}

function openSchoolQuest() {
  if (schoolTaskState.completed) {
    return;
  }

  schoolTaskState.panelOpen = true;
  firstPersonInput.keys.clear();
  document.exitPointerLock?.();
  // 进入学校任务：世界切到黄昏记忆。
  window.clearTimeout(modeRevertTimer);
  transitionToMode('memory', 800);
  setTask('level3');
  ensureSchoolSortAssets();
  renderSchoolSort();
  updateSchoolSortHint('把散落的旧明信片拼回原来的画面。');

  if (schoolQuestPanel) {
    schoolQuestPanel.hidden = false;
  }
  syncQuestOpenClass();
  setStatus('记忆拼图：拼回散落的旧明信片。');
}

function closeSchoolQuest(message) {
  schoolTaskState.panelOpen = false;
  schoolTaskState.inRange = worldRoot && distanceToSchoolTask() <= schoolProximityRadius();
  if (schoolQuestPanel) {
    schoolQuestPanel.hidden = true;
  }
  syncQuestOpenClass();
  firstPersonInput.keys.clear();

  if (message) {
    setStatus(message);
  } else if (schoolTaskState.completed) {
    setStatus('记忆拼图完成。');
  } else if (worldRoot) {
    setStatus(sceneReadyStatus());
  }
}

function selectSchoolSortTile(tileId) {
  if (!schoolSortTiles[tileId] || schoolTaskState.completed) {
    return;
  }

  schoolTaskState.selectedTile = tileId;
  renderSchoolSort();
}

function placeSelectedSchoolSortTile(slotIndex) {
  if (
    schoolTaskState.completed ||
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= schoolTaskState.placements.length ||
    !schoolTaskState.selectedTile
  ) {
    return;
  }

  schoolTaskState.placements = schoolTaskState.placements.map((tileId, index) => (
    tileId === schoolTaskState.selectedTile && index !== slotIndex ? null : tileId
  ));
  schoolTaskState.placements[slotIndex] = schoolTaskState.selectedTile;
  schoolTaskState.selectedTile = null;
  updateSchoolSortHint('把散落的旧明信片拼回原来的画面。');
  renderSchoolSort();
}

function submitSchoolSort() {
  if (schoolTaskState.completed) {
    updateSchoolSortHint('记忆拼图完成。');
    return;
  }

  if (schoolTaskState.placements.some((tileId) => !tileId)) {
    updateSchoolSortHint('还有格子没放。');
    return;
  }

  const correct = schoolTaskState.placements.every((tileId, index) => tileId === schoolSortAnswer[index]);
  if (!correct) {
    updateSchoolSortHint('顺序不对，再试一次。');
    return;
  }

  completeSchoolTask();
}

function resetSchoolSort() {
  if (schoolTaskState.completed) {
    updateSchoolSortHint('记忆拼图完成。');
    return;
  }

  schoolTaskState.selectedTile = null;
  schoolTaskState.placements = Array(schoolSortAnswer.length).fill(null);
  updateSchoolSortHint('把散落的旧明信片拼回原来的画面。');
  renderSchoolSort();
}

function completeSchoolTask() {
  if (schoolTaskState.completed) {
    return;
  }

  schoolTaskState.completed = true;
  schoolTaskState.panelOpen = false;
  schoolTaskState.inRange = false;
  schoolTaskState.selectedTile = null;
  if (schoolHotspot) {
    schoolHotspot.visible = false;
  }
  if (homeHotspot) {
    homeHotspot.visible = true;
  }
  updateSchoolSortHint('记忆拼图完成。');
  closeSchoolQuest('记忆拼图完成。');
  unlockMemories(4);
  setTask('level4');
  showDialog(storyCopy.dialogs.memoryDone, { onComplete: () => showMemory(storyCopy.memories[1]) });
  startLevel4Companion(); // 玩家牵着爷爷一起走回家（不再用爷爷反向领走的过场）
  refreshObjectiveReveal();
  scheduleModeRevert(30000, 5000); // 学校完成 30s 后用 5s 渐变回贴图平涂
  autoSaveProgress();
}

function renderSchoolSort() {
  schoolSortSources.forEach((source) => {
    const tileId = source.dataset.schoolSortTile;
    source.classList.toggle('selected', schoolTaskState.selectedTile === tileId);
    source.classList.toggle('placed', schoolTaskState.placements.includes(tileId));
    source.disabled = schoolTaskState.completed;
    ensureSchoolSortImage(source, schoolSortTiles[tileId]);
  });

  schoolSortSlots.forEach((slot) => {
    const slotIndex = Number(slot.dataset.schoolSortSlot);
    const tileId = schoolTaskState.placements[slotIndex];
    slot.classList.toggle('filled', Boolean(tileId));
    slot.disabled = schoolTaskState.completed;
    if (tileId) {
      ensureSchoolSortImage(slot, schoolSortTiles[tileId]);
    } else {
      slot.textContent = '';
      delete slot.dataset.renderedSrc;
    }
  });

  if (schoolSortSubmit) {
    schoolSortSubmit.disabled = schoolTaskState.completed;
  }
  if (schoolSortReset) {
    schoolSortReset.disabled = schoolTaskState.completed;
  }
}

function ensureSchoolSortAssets() {
  if (schoolSortStage && !schoolSortStage.dataset.backgroundLoaded) {
    schoolSortStage.dataset.backgroundLoaded = 'true';
    schoolSortStage.style.backgroundImage = `url("${schoolSortBoardImage.src}")`;
    const boardProbe = new Image();
    boardProbe.onerror = () => {
      schoolSortStage.style.backgroundImage = `url("${schoolSortBoardImage.fallback}")`;
    };
    boardProbe.src = schoolSortBoardImage.src;
  }
}

function ensureSchoolSortImage(container, asset) {
  if (!container || !asset?.src || container.dataset.renderedSrc === asset.src) {
    return;
  }

  container.textContent = '';
  const image = document.createElement('img');
  image.alt = '';
  image.decoding = 'async';
  image.loading = 'lazy';
  image.onerror = () => {
    if (asset.fallback && image.src !== asset.fallback) {
      image.src = asset.fallback;
    }
  };
  image.src = asset.src;
  container.appendChild(image);
  container.dataset.renderedSrc = asset.src;
}

function updateSchoolSortHint(message) {
  if (schoolSortHint) {
    schoolSortHint.textContent = message;
  }
}

function createSchoolHotspot() {
  if (schoolHotspot) {
    scene.remove(schoolHotspot);
  }

  const marker = spaceMarkers.schoolTask;
  const group = createTaskHotspot('SchoolTaskHotspot', marker, 0x7bdff2, 'schoolHotspot');
  schoolHotspot = group;
  scene.add(schoolHotspot);
}

function createHomeHotspot() {
  if (homeHotspot) {
    scene.remove(homeHotspot);
  }

  const marker = spaceMarkers.grandpaHomeTask;
  const group = createTaskHotspot('HomeTaskHotspot', marker, 0xf2b544, 'homeHotspot');
  group.visible = schoolTaskState.completed && !homeTaskState.completed;
  homeHotspot = group;
  scene.add(homeHotspot);
}

function pickSchoolTask(event) {
  if (!mailboxTaskState.completed || !schoolHotspot || schoolTaskState.completed || !schoolHotspot.visible) {
    return false;
  }

  const maxDistance = 52;
  if (camera.position.distanceTo(schoolHotspot.position) > maxDistance) {
    return false;
  }

  if (event) {
    const rect = canvas.getBoundingClientRect();
    schoolPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    schoolPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  } else {
    schoolPointer.set(0, 0);
  }

  schoolRaycaster.setFromCamera(schoolPointer, camera);
  schoolRaycaster.near = 0;
  schoolRaycaster.far = maxDistance;
  const hits = schoolRaycaster.intersectObjects(schoolHotspot.children, false);
  return hits.some((hit) => hit.object?.userData.schoolHotspot);
}

function pickHomeTask(event) {
  if (!schoolTaskState.completed || !homeHotspot || homeTaskState.completed || !homeHotspot.visible) {
    return false;
  }

  const maxDistance = 52;
  if (camera.position.distanceTo(homeHotspot.position) > maxDistance) {
    return false;
  }

  if (event) {
    const rect = canvas.getBoundingClientRect();
    homePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    homePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  } else {
    homePointer.set(0, 0);
  }

  homeRaycaster.setFromCamera(homePointer, camera);
  homeRaycaster.near = 0;
  homeRaycaster.far = maxDistance;
  const hits = homeRaycaster.intersectObjects(homeHotspot.children, false);
  return hits.some((hit) => hit.object?.userData.homeHotspot);
}

function isQuestPanelOpen() {
  return (
    !gameUiState.started ||
    mailboxTaskState.panelOpen ||
    schoolTaskState.panelOpen ||
    homeTaskState.panelOpen ||
    Boolean(uiScreens.dialog && !uiScreens.dialog.hidden) ||
    Boolean(uiScreens.memory && !uiScreens.memory.hidden) ||
    Boolean(uiScreens.pause && !uiScreens.pause.hidden) ||
    Boolean(uiScreens.settings && !uiScreens.settings.hidden) ||
    Boolean(uiScreens.ending && !uiScreens.ending.hidden) ||
    listenTaskState.active
  );
}

function updateSunRig(root, activeMode) {
  if (!root) return;

  const box = getVisibleContentBox(root);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 1);
  const lightOffset = lightingProfileForMode(activeMode).sunOffset.clone().multiplyScalar(radius);

  sunTarget.position.copy(center);
  sun.position.copy(center).add(lightOffset);
  sunTarget.updateMatrixWorld();
  sun.updateMatrixWorld();
}

function getVisibleContentBox(root) {
  if (root === worldRoot && sceneCache.visibleContentBox) {
    return sceneCache.visibleContentBox.clone();
  }

  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || isSkyObject(object) || object.userData.excludeFromBounds || object.parent?.userData.excludeFromBounds) return;
    const objectBox = new THREE.Box3().setFromObject(object);
    if (!objectBox.isEmpty()) {
      box.union(objectBox);
    }
  });

  return box;
}

function rebuildSceneCaches(root) {
  if (!root) {
    return;
  }

  sceneCache.visibleContentBox = null;
  sceneCache.debugPickObjects = null;
  sceneCache.streetLightCandidates = null;
  sceneCache.groundLightY = null;
  sceneCache.outlineObjects = [];

  const box = new THREE.Box3();
  const debugPickObjects = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || object.userData.excludeFromBounds || object.parent?.userData.excludeFromBounds || isSkyObject(object)) {
      return;
    }

    const objectBox = new THREE.Box3().setFromObject(object);
    if (!objectBox.isEmpty()) {
      box.union(objectBox);
    }
    if (!object.userData.skipStylize && !object.parent?.userData.skipStylize) {
      debugPickObjects.push(object);
    }
  });

  sceneCache.visibleContentBox = box;
  sceneCache.visibleContentSize.copy(box.getSize(new THREE.Vector3()));
  sceneCache.visibleContentCenter.copy(box.getCenter(new THREE.Vector3()));
  sceneCache.debugPickObjects = debugPickObjects;
}

function buildDashedRouteSegment(markers, objectiveKey) {
  const routeLift = 0.2;
  const points = markers.map((m) => new THREE.Vector3(m.x, m.y + routeLift, m.z));
  const curve = new THREE.CatmullRomCurve3(points);
  const samples = curve.getPoints(Math.max(24, points.length * 40));
  const dashPositions = [];
  for (let i = 0; i < samples.length - 2; i += 4) {
    dashPositions.push(samples[i].x, samples[i].y, samples[i].z);
    dashPositions.push(samples[i + 2].x, samples[i + 2].y, samples[i + 2].z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(dashPositions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xffc93d,
    transparent: true,
    opacity: 0.95,
    linewidth: 3,
    depthTest: true,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.name = `MemoryRoute_${objectiveKey}`;
  line.renderOrder = 4;
  line.userData.skipStylize = true;
  line.userData.excludeFromBounds = true;
  line.userData.objectiveKey = objectiveKey;
  line.visible = false;
  return line;
}

function addMemoryRoute() {
  for (const seg of routeSegments) {
    scene.remove(seg);
    disposeDebugObject(seg);
  }
  routeSegments = [];

  // 记忆残留黄色虚线：按段铺设，只显示通向"当前目标"的那一段（逐任务出现）。
  routeSegments.push(buildDashedRouteSegment([spaceMarkers.playerSpawn, spaceMarkers.hennessyRoad1, spaceMarkers.mailboxTask], 'mailbox'));
  routeSegments.push(buildDashedRouteSegment([spaceMarkers.mailboxTask, spaceMarkers.schoolTask], 'school'));
  routeSegments.push(buildDashedRouteSegment([spaceMarkers.schoolTask, spaceMarkers.grandpaHomeTask], 'home'));
  for (const seg of routeSegments) {
    scene.add(seg);
  }
  refreshObjectiveReveal();
}

// 当前目标键：驱动逐任务显隐（气泡/任务球/路线段）。
function currentObjectiveKey() {
  if (!gameUiState.started) return null;
  if (!gameUiState.level1Complete) return 'start';
  if (!mailboxTaskState.completed) return 'mailbox';
  if (!schoolTaskState.completed) return 'school';
  if (!homeTaskState.completed) return 'home';
  return null;
}

function refreshObjectiveReveal() {
  const key = currentObjectiveKey();
  for (const label of locationLabels) {
    label.visible = label.userData.objectiveKey === key;
  }
  if (mailboxHotspot) mailboxHotspot.visible = key === 'mailbox';
  if (schoolHotspot) schoolHotspot.visible = key === 'school';
  if (homeHotspot) homeHotspot.visible = key === 'home';
  for (const seg of routeSegments) {
    seg.visible = seg.userData.objectiveKey === key;
  }
  maybeSpeakObjectiveGuide(key);
}

// 目标切换时让爷爷指路（多说话）。只在游戏中、目标变化、且没有模态对白时触发。
function maybeSpeakObjectiveGuide(key) {
  if (!gameUiState.started || key === lastGuidedObjectiveKey) {
    return;
  }
  lastGuidedObjectiveKey = key;
  const lines = storyCopy.dialogs.companion.guide?.[key];
  if (!lines || !lines.length) {
    return;
  }
  if (uiScreens.dialog && !uiScreens.dialog.hidden) {
    return; // 模态对白进行中，避免气泡和对白重叠
  }
  // 稍延迟，等任务提示/对白落定后再由爷爷开口指路
  window.setTimeout(() => {
    if (currentObjectiveKey() === key && (!uiScreens.dialog || uiScreens.dialog.hidden)) {
      grandpaSpeak(pickCompanionLine(lines, 'guideIndex'), 3400);
    }
  }, 900);
}

// 地点气泡遮挡剔除：从相机向当前目标气泡发一条射线，若中途被场景几何挡住则隐藏气泡。
// 每 6 帧只处理当前激活的那一个气泡，开销可忽略。
function updateLocationLabelOcclusion() {
  labelOcclusionFrame = (labelOcclusionFrame + 1) % 6;
  if (labelOcclusionFrame !== 0) {
    return;
  }
  const key = currentObjectiveKey();
  const occluderRoot = lodRoot && lodRoot.visible ? lodRoot : worldRoot;
  for (const label of locationLabels) {
    if (label.userData.objectiveKey !== key) {
      label.visible = false;
      continue;
    }
    if (!occluderRoot) {
      label.visible = true;
      continue;
    }
    labelOcclusionDir.subVectors(label.position, camera.position);
    const distance = labelOcclusionDir.length();
    if (distance < 1.2) {
      label.visible = true;
      continue;
    }
    labelOcclusionDir.multiplyScalar(1 / distance);
    labelOcclusionRaycaster.set(camera.position, labelOcclusionDir);
    labelOcclusionRaycaster.near = 0.5;
    labelOcclusionRaycaster.far = distance - 1.0; // 留出气泡前的余量，避免自遮挡
    const hits = labelOcclusionRaycaster.intersectObject(occluderRoot, true);
    const blocked = hits.some(
      (hit) => hit.object?.isMesh && hit.object.visible && !hit.object.userData?.excludeFromBounds,
    );
    label.visible = !blocked;
  }
}

// 地点气泡标签：黑厚描边白底矩形气泡，悬浮在任务点上方（策划 §五 diegetic UI）。
function createLocationLabelTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const padX = 22;
  const boxW = canvas.width - padX * 2;
  const boxH = 118;
  const boxX = padX;
  const boxY = 16;
  const radius = 26;
  const border = 10;

  const rounded = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // 黑厚描边 + 白底
  ctx.fillStyle = '#15120c';
  rounded(boxX - border, boxY - border, boxW + border * 2, boxH + border * 2, radius + border);
  ctx.fill();
  ctx.fillStyle = '#fffdf5';
  rounded(boxX, boxY, boxW, boxH, radius);
  ctx.fill();

  // 底部小尖角指向地面
  ctx.fillStyle = '#15120c';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 26, boxY + boxH);
  ctx.lineTo(canvas.width / 2 + 26, boxY + boxH);
  ctx.lineTo(canvas.width / 2, boxY + boxH + 52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fffdf5';
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 16, boxY + boxH - 2);
  ctx.lineTo(canvas.width / 2 + 16, boxY + boxH - 2);
  ctx.lineTo(canvas.width / 2, boxY + boxH + 34);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#15120c';
  ctx.font = '800 52px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, boxY + boxH / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function addLocationLabels() {
  for (const label of locationLabels) {
    scene.remove(label);
    disposeDebugObject(label);
  }
  locationLabels = [];

  const labelDefs = [
    { marker: spaceMarkers.playerSpawn, text: '起点 · 客运站', key: 'start' },
    { marker: spaceMarkers.mailboxTask, text: '老宿舍 · 2号信箱', key: 'mailbox' },
    { marker: spaceMarkers.schoolTask, text: '槐安县实验小学', key: 'school' },
    { marker: spaceMarkers.grandpaHomeTask, text: '终章 · 家', key: 'home' },
  ];

  for (const def of labelDefs) {
    const texture = createLocationLabelTexture(def.text);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(def.marker.x, def.marker.y + 5.0, def.marker.z);
    sprite.scale.set(5.2, 1.95, 1);
    sprite.renderOrder = 1;
    sprite.name = `LocationLabel_${def.marker.id}`;
    sprite.userData.skipStylize = true;
    sprite.userData.excludeFromBounds = true;
    sprite.userData.objectiveKey = def.key;
    scene.add(sprite);
    locationLabels.push(sprite);
  }
  refreshObjectiveReveal();
}

function updateStylizedLightAccents(root, activeMode) {
  stylizedLightGroup.clear();
  if (!root || activeMode !== 'night') return;

  const box = getVisibleContentBox(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const y = estimateGroundLightY(root, box.min.y + Math.max(size.y * 0.012, 0.55));

  addStreetLampLightAccents(root, size, y);
}

function addStreetLampLightAccents(root, sceneSize, groundY) {
  const candidates = collectStreetLightCandidates(root);
  if (!candidates.length) {
    return 0;
  }

  const sceneScale = Math.max(sceneSize.x, sceneSize.z, 1);
  const usedCenters = [];
  let patchCount = 0;

  candidates.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'lamppost' ? -1 : 1;
    }
    return a.center.z - b.center.z;
  });

  for (const candidate of candidates) {
    if (patchCount >= 5) {
      break;
    }

    const spacing = sceneScale * 0.028;
    if (usedCenters.some((center) => horizontalDistanceSq(center, candidate.center) < spacing * spacing)) {
      continue;
    }

    usedCenters.push(candidate.center.clone());

    const rng = seededRandom(candidate.seed);
    const radius = THREE.MathUtils.clamp(
      sceneScale * 0.032 * (0.82 + rng() * 0.28),
      8,
      26,
    );
    const depth = radius * (0.44 + rng() * 0.18);
    const rotation = -0.85 + rng() * 1.7;
    const offset = radius * 0.16;
    const x = candidate.center.x + Math.sin(rotation) * offset;
    const z = candidate.center.z + Math.cos(rotation) * offset;
    const color = rng() > 0.36 ? 0xffcc62 : 0xffb84d;

    stylizedLightGroup.add(createLightPatch(
      x,
      groundY,
      z,
      radius,
      depth,
      color,
      0.32,
      rotation,
    ));
    stylizedLightGroup.add(createLightPatch(
      x,
      groundY + 0.018,
      z,
      radius * 0.42,
      depth * 0.48,
      0xffe09a,
      0.14,
      rotation + 0.1,
    ));

    const shadowRotation = rotation + Math.PI * (0.5 + rng() * 0.22);
    stylizedLightGroup.add(createGroundRectPatch(
      x + Math.sin(shadowRotation) * radius * 0.22,
      groundY + 0.036,
      z + Math.cos(shadowRotation) * radius * 0.22,
      Math.max(radius * 0.09, 1),
      radius * 0.74,
      0x111b2b,
      0.24,
      shadowRotation,
    ));

    patchCount += 1;
  }

  return patchCount;
}

function estimateGroundLightY(root, fallbackY) {
  if (root === worldRoot && sceneCache.groundLightY !== null) {
    return sceneCache.groundLightY;
  }

  const surfaceYs = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || object.userData.skipStylize || object.parent?.userData.skipStylize) {
      return;
    }

    const source = object.userData.sourceMaterial ?? object.material;
    const materials = Array.isArray(source) ? source : [source];
    const isGroundSurface = materials.some((material) => {
      const category = classify(material?.name ?? object.name);
      return category === 'road' || category === 'roadMarking' || category === 'sidewalk';
    });

    if (!isGroundSurface) {
      return;
    }

    const objectBox = new THREE.Box3().setFromObject(object);
    if (!objectBox.isEmpty()) {
      surfaceYs.push(objectBox.max.y);
    }
  });

  if (!surfaceYs.length) {
    return fallbackY;
  }

  surfaceYs.sort((a, b) => a - b);
  const y = surfaceYs[Math.floor((surfaceYs.length - 1) * 0.2)] + 0.08;
  if (root === worldRoot) {
    sceneCache.groundLightY = y;
  }
  return y;
}

function collectStreetLightCandidates(root) {
  if (root === worldRoot && sceneCache.streetLightCandidates) {
    return sceneCache.streetLightCandidates;
  }

  const candidates = [];
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!object.isMesh || !object.visible || object.userData.skipStylize || object.parent?.userData.skipStylize) {
      return;
    }

    const text = lightNameText(object);
    if (!object.name.toLowerCase().includes('lamppost')) {
      return;
    }

    const lightBox = new THREE.Box3().setFromObject(object);
    if (lightBox.isEmpty()) {
      return;
    }

    const center = lightBox.getCenter(new THREE.Vector3());
    const objectName = object.name.toLowerCase();
    candidates.push({
      center,
      kind: 'lamppost',
      seed: hashString(`${object.name}:${text}:${center.x.toFixed(1)}:${center.z.toFixed(1)}`),
    });
  });
  if (root === worldRoot) {
    sceneCache.streetLightCandidates = candidates;
  }
  return candidates;
}

function lightNameText(object) {
  const source = object.userData.sourceMaterial ?? object.material;
  const materials = Array.isArray(source) ? source : [source];
  return [
    object.name,
    object.parent?.name,
    ...materials.map((material) => material?.name),
  ].filter(Boolean).join(' ').toLowerCase();
}

function horizontalDistanceSq(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function createLightPatch(x, y, z, width, depth, color, opacity, rotation) {
  const geometry = new THREE.CircleGeometry(1, 36);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const patch = new THREE.Mesh(geometry, material);
  patch.name = 'StylizedLightPatch';
  patch.userData.skipStylize = true;
  patch.userData.excludeFromBounds = true;
  patch.position.set(x, y, z);
  patch.rotation.set(-Math.PI / 2, 0, rotation);
  patch.scale.set(Math.max(width, 1), Math.max(depth, 1), 1);
  patch.renderOrder = 2;
  return patch;
}

function createGroundRectPatch(x, y, z, width, depth, color, opacity, rotation) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const patch = new THREE.Mesh(geometry, material);
  patch.name = 'StylizedLampShadowPatch';
  patch.userData.skipStylize = true;
  patch.userData.excludeFromBounds = true;
  patch.position.set(x, y, z);
  patch.rotation.set(-Math.PI / 2, 0, rotation);
  patch.scale.set(Math.max(width, 0.4), Math.max(depth, 0.4), 1);
  patch.renderOrder = 2.1;
  return patch;
}

function initSpaceDebug() {
  loadDebugMarkers();
  renderDebugMarkers();
  renderDebugList();
  const debugRequested = new URLSearchParams(window.location.search).has('debug');
  // 正常运行隐藏整条顶部开发/调试栏（模式按钮 + 空间标记 + 状态文字），仅 ?debug=1 显示。
  const hudEl = document.querySelector('.hud');
  if (hudEl) {
    hudEl.hidden = !debugRequested;
  }
  if (debugToggle) {
    debugToggle.hidden = !debugRequested;
  }
  setDebugActive(debugRequested);

  if (debugRequested) {
    // QA 快捷入口（仅 ?debug）：跳到最后一关/结尾，便于验证流程闭环。
    // 先收起加载层，否则 z-index 30 的加载层会盖住下面被钩子打开的面板。
    const dismissLoadingOverlay = () => {
      if (uiScreens.loading) uiScreens.loading.hidden = true;
      document.body.classList.remove('ui-loading');
    };
    window.__qa = {
      delivery: () => {
        dismissLoadingOverlay();
        gameUiState.started = true;
        gameUiState.level1Complete = true;
        mailboxTaskState.completed = true;
        schoolTaskState.completed = true;
        listenTaskState.completed = true;
        gameUiState.grandpaLeading = false;
        homeTaskState.completed = false;
        homeTaskState.panelOpen = false;
        openDeliveryPanel();
      },
      finishDelivery: () => {
        homeTaskState.scratchComplete = true;
        homeTaskState.letterOpen = true;
        homeTaskState.signed = true;
        homeTaskState.deliveryStage = DELIVERY_STAGE.signature;
        completeHomeTask();
      },
      ending: () => {
        dismissLoadingOverlay();
        showEndingScreen();
      },
      advanceEnding: () => advanceEnding(),
      // 体感校准向导（仅 ?debug，桌面无真机传感器时用于静态截图各步 UI）。
      openCalib: () => {
        dismissLoadingOverlay();
        if (uiScreens.calibration) uiScreens.calibration.hidden = false;
        syncQuestOpenClass();
        resetCalibrationWizard();
        goToCalibrationStep(1);
      },
      calibStep: (n) => {
        dismissLoadingOverlay();
        if (uiScreens.calibration) uiScreens.calibration.hidden = false;
        calibrationState.step = n;
        renderCalibrationStep();
      },
      calibPrimary: () => handleCalibrationPrimary(),
      // 爷爷模型/模式探针（验收用）。
      setMode: (m) => setMode(m),
      frameGrandpa: () => {
        if (!grandpaRoot) {
          return false;
        }
        const g = grandpaRoot.position;
        camera.position.set(g.x, g.y + 1.55, g.z + 4.2);
        syncFirstPersonAnglesFromLook(
          camera.position,
          new THREE.Vector3(g.x, g.y + 1.1, g.z),
        );
        return true;
      },
      grandpaInfo: () => {
        if (!grandpaRoot) {
          return { ready: false };
        }
        const box = new THREE.Box3().setFromObject(grandpaRoot);
        const size = box.getSize(new THREE.Vector3());
        let visibleMeshes = 0;
        grandpaRoot.traverse((o) => {
          if (o.isMesh && o.visible) visibleMeshes += 1;
        });
        return {
          ready: true,
          mode,
          modelEnabled: grandpaModel.enabled,
          active: grandpaModel.active,
          pos: grandpaRoot.position.toArray().map((n) => +n.toFixed(2)),
          rotY: +grandpaRoot.rotation.y.toFixed(3),
          height: +size.y.toFixed(3),
          width: +size.x.toFixed(3),
          minY: +box.min.y.toFixed(3),
          visibleMeshes,
        };
      },
      // 关卡四陪伴：在地图上就地建立"牵着爷爷一起走"状态，便于验收跟随/抛下/呼喊。
      level4: () => {
        dismissLoadingOverlay();
        gameUiState.started = true;
        gameUiState.level1Complete = true;
        mailboxTaskState.completed = true;
        schoolTaskState.completed = true;
        listenTaskState.completed = true;
        homeTaskState.completed = false;
        homeTaskState.panelOpen = false;
        gameUiState.grandpaLeading = false;
        setMode('texture');
        setTask('level4');
        if (grandpaRoot) {
          grandpaRoot.position.set(
            camera.position.x + 1.2,
            spaceMarkers.playerSpawn.y + grandpaPreview.groundLift,
            camera.position.z + 1.2,
          );
        }
        startLevel4Companion();
      },
      teleport: (dx = 0, dz = 0) => {
        camera.position.x += dx;
        camera.position.z += dz;
      },
      lookPitch: (deg = 40) => {
        firstPersonInput.pitch = THREE.MathUtils.clamp(
          THREE.MathUtils.degToRad(deg),
          -firstPersonPreview.maxPitch,
          firstPersonPreview.maxPitch,
        );
        applyFirstPersonCameraRotation();
      },
      // 确定性推进关卡四陪伴逻辑（绕过 headless 的渲染循环节流，用于验收）。
      placeGrandpaRel: (dx = 0, dz = 0) => {
        if (grandpaRoot) {
          grandpaRoot.position.set(
            camera.position.x + dx,
            spaceMarkers.playerSpawn.y + grandpaPreview.groundLift,
            camera.position.z + dz,
          );
        }
      },
      tickL4: (n = 1) => {
        for (let i = 0; i < n; i += 1) {
          updateLevel4Companion(0.05);
        }
      },
      level4Info: () => ({
        active: level4State.active,
        held: grandpaState.held,
        lost: grandpaState.lost,
        talking: level4State.talking,
        gap: grandpaRoot ? +grandpaToPlayerGap().toFixed(2) : null,
        sayVisible: grandpaSayEl ? !grandpaSayEl.hidden : false,
        sayText: grandpaSayTextEl?.textContent ?? '',
        deliveryOpen: homeTaskState.panelOpen,
      }),
      clouds: () => ({
        sprites: cloudGroup.children.length,
        ready: cloudAssetsReady,
        classicRender: runtimeConfig.classicRender,
        positions: cloudGroup.children.map((cloud) => ({
          x: +cloud.position.x.toFixed(2),
          y: +cloud.position.y.toFixed(2),
          z: +cloud.position.z.toFixed(2),
          width: +cloud.scale.x.toFixed(2),
        })),
      }),
      grandpaScreen: () => {
        if (!grandpaRoot) {
          return { ready: false };
        }
        const head = grandpaRoot.position.clone();
        head.y += 1.5;
        camera.updateMatrixWorld();
        const ndc = head.project(camera);
        return {
          ready: true,
          ndc: [+ndc.x.toFixed(2), +ndc.y.toFixed(2), +ndc.z.toFixed(2)],
          inView: ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
        };
      },
      jumpTo: (n) => jumpToLevel(n),
      ending: () => {
        gameUiState.started = true;
        dismissLoadingOverlay();
        showEndingScreen();
      },
    };
  }

  debugToggle?.addEventListener('click', () => setDebugActive(!debugActive));
  debugClose?.addEventListener('click', () => setDebugActive(false));
  debugCopy?.addEventListener('click', copyDebugMarkers);
  debugClear?.addEventListener('click', () => {
    debugMarkers.length = 0;
    debugNextMarkerId = 1;
    saveDebugMarkers();
    renderDebugMarkers();
    renderDebugList();
    setDebugHitText('已清空标记');
  });

  debugList?.addEventListener('input', (event) => {
    if (!event.target?.matches?.('.debug-note')) {
      return;
    }

    const marker = findDebugMarker(event.target.dataset.markerId);
    if (!marker) {
      return;
    }

    marker.note = event.target.value;
    saveDebugMarkers();
  });

  debugList?.addEventListener('click', (event) => {
    const removeButton = event.target?.closest?.('[data-remove-marker]');
    if (removeButton) {
      const marker = findDebugMarker(removeButton.dataset.removeMarker);
      if (marker) {
        removeDebugMarker(marker.id);
      }
      return;
    }

    const item = event.target?.closest?.('[data-debug-marker]');
    if (item && !event.target?.matches?.('textarea, button')) {
      focusDebugMarker(findDebugMarker(item.dataset.debugMarker));
    }
  });

  canvas.addEventListener('pointerdown', (event) => {
    debugPointerDown.set(event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerup', handleDebugPointerUp);

  window.__spaceDebug = {
    getMarkers: () => debugMarkers.map(cloneDebugMarker),
    clear: () => {
      debugMarkers.length = 0;
      debugNextMarkerId = 1;
      saveDebugMarkers();
      renderDebugMarkers();
      renderDebugList();
      setDebugHitText('已清空标记');
    },
    setActive: setDebugActive,
    placeGrandpaAtMarker: (id) => moveGrandpaToMarker(findDebugMarker(id)),
    placeGrandpaAtSpawn,
    getGrandpa: grandpaDebugState,
    getCamera: firstPersonDebugState,
    getCollision: collisionDebugState,
  };
}

function setDebugActive(active) {
  debugActive = Boolean(active);
  document.body.classList.toggle('debug-marking', debugActive);
  if (debugToggle) {
    debugToggle.classList.toggle('active', debugActive);
    debugToggle.setAttribute('aria-pressed', String(debugActive));
  }
  if (debugPanel) {
    debugPanel.hidden = !debugActive;
  }
  setDebugHitText(debugActive ? '点击模型表面添加点' : '空间标记已关闭');
}

function handleDebugPointerUp(event) {
  if (!debugActive || event.button !== 0) {
    return;
  }

  const moved = Math.hypot(
    event.clientX - debugPointerDown.x,
    event.clientY - debugPointerDown.y,
  );
  if (moved > 6) {
    return;
  }

  const hit = pickDebugSurface(event);
  if (!hit) {
    setDebugHitText('没有拾取到模型表面');
    return;
  }

  addDebugMarkerFromHit(hit);
}

function pickDebugSurface(event) {
  const rect = canvas.getBoundingClientRect();
  debugPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  debugPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  debugRaycaster.setFromCamera(debugPointer, camera);

  const objects = collectDebugPickObjects();
  const hits = debugRaycaster.intersectObjects(objects, false);
  return hits.find((hit) => hit.object?.isMesh && !hit.object.userData.skipStylize) ?? null;
}

function collectDebugPickObjects() {
  if (sceneCache.debugPickObjects && !grandpaRoot) {
    return sceneCache.debugPickObjects;
  }

  const objects = [];
  for (const root of [worldRoot]) {
    if (!root) {
      continue;
    }

    if (sceneCache.debugPickObjects) {
      objects.push(...sceneCache.debugPickObjects);
    }
  }

  if (grandpaRoot) {
    objects.push(...getGrandpaPickObjects());
  }
  return objects;
}

function addDebugMarkerFromHit(hit) {
  const point = hit.point;
  const marker = {
    id: debugNextMarkerId,
    x: roundMarkerValue(point.x),
    y: roundMarkerValue(point.y),
    z: roundMarkerValue(point.z),
    surface: debugSurfaceName(hit),
    note: '',
  };

  debugNextMarkerId += 1;
  debugMarkers.push(marker);
  saveDebugMarkers();
  renderDebugMarkers();
  renderDebugList();
  setDebugHitText(`#${marker.id} ${formatMarkerCoords(marker)}`);
}

function debugSurfaceName(hit) {
  const object = hit.object;
  const source = object.userData.sourceMaterial ?? object.material;
  const materials = Array.isArray(source) ? source : [source];
  const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
  return [
    object.name,
    material?.name,
  ].filter(Boolean).join(' / ') || 'surface';
}

function loadDebugMarkers() {
  try {
    const stored = JSON.parse(localStorage.getItem(debugMarkerStorageKey) ?? '[]');
    if (!Array.isArray(stored)) {
      return;
    }

    for (const item of stored) {
      if (!Number.isFinite(item?.x) || !Number.isFinite(item?.y) || !Number.isFinite(item?.z)) {
        continue;
      }

      const id = Number.isFinite(item.id) ? item.id : debugNextMarkerId;
      debugMarkers.push({
        id,
        x: roundMarkerValue(item.x),
        y: roundMarkerValue(item.y),
        z: roundMarkerValue(item.z),
        surface: String(item.surface ?? 'surface'),
        note: String(item.note ?? ''),
      });
      debugNextMarkerId = Math.max(debugNextMarkerId, id + 1);
    }
  } catch (error) {
    console.warn('Space marker load failed', error);
  }
}

function saveDebugMarkers() {
  try {
    localStorage.setItem(debugMarkerStorageKey, JSON.stringify(debugMarkers.map(cloneDebugMarker)));
  } catch (error) {
    console.warn('Space marker save failed', error);
  }
}

function renderDebugMarkers() {
  for (const child of debugMarkerGroup.children) {
    disposeDebugObject(child);
  }
  debugMarkerGroup.clear();
  debugMarkerGroup.visible = false;
}

function createDebugMarkerObject(marker) {
  const group = new THREE.Group();
  group.name = `SpaceMarker_${marker.id}`;
  group.userData.skipStylize = true;
  group.userData.excludeFromBounds = true;
  group.position.set(marker.x, marker.y + 0.12, marker.z);

  const pinMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4f5b,
    depthTest: true,
    toneMapped: false,
  });
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4f5b,
    transparent: true,
    opacity: 0.72,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.92, 32), ringMaterial);
  ring.name = `SpaceMarker_${marker.id}_ring`;
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.35, 8), pinMaterial.clone());
  stem.name = `SpaceMarker_${marker.id}_stem`;
  stem.position.y = 0.72;
  group.add(stem);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), pinMaterial.clone());
  head.name = `SpaceMarker_${marker.id}_head`;
  head.position.y = 1.44;
  group.add(head);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createDebugLabelTexture(marker.id),
    transparent: true,
    depthTest: true,
    toneMapped: false,
  }));
  label.name = `SpaceMarker_${marker.id}_label`;
  label.position.y = 2.15;
  label.scale.set(1.8, 1.8, 1);
  group.add(label);

  return group;
}

function createDebugLabelTexture(id) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 128;
  labelCanvas.height = 128;
  const ctx = labelCanvas.getContext('2d');
  ctx.fillStyle = '#11100d';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff4f5b';
  ctx.beginPath();
  ctx.arc(64, 64, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fffdf5';
  ctx.font = '800 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(id), 64, 66);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function renderDebugList() {
  if (!debugList) {
    return;
  }

  if (!debugMarkers.length) {
    debugList.innerHTML = '<li class="debug-empty">暂无标记</li>';
    return;
  }

  debugList.innerHTML = debugMarkers.map((marker) => `
    <li class="debug-item" data-debug-marker="${marker.id}">
      <header>
        <strong>#${marker.id}</strong>
        <button type="button" class="debug-remove" data-remove-marker="${marker.id}">删除</button>
      </header>
      <div class="debug-coords">${escapeHtml(formatMarkerCoords(marker))}<br>${escapeHtml(marker.surface)}</div>
      <textarea class="debug-note" data-marker-id="${marker.id}" placeholder="备注">${escapeHtml(marker.note)}</textarea>
    </li>
  `).join('');
}

async function copyDebugMarkers() {
  const text = JSON.stringify({
    mode,
    markers: debugMarkers.map(cloneDebugMarker),
  }, null, 2);

  try {
    await copyText(text);
    setDebugHitText(`已复制 ${debugMarkers.length} 个标记`);
  } catch (error) {
    console.warn('Space marker copy failed', error);
    setDebugHitText('复制失败，请从控制台读取 window.__spaceDebug.getMarkers()');
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function removeDebugMarker(id) {
  const index = debugMarkers.findIndex((marker) => marker.id === id);
  if (index < 0) {
    return;
  }

  debugMarkers.splice(index, 1);
  saveDebugMarkers();
  renderDebugMarkers();
  renderDebugList();
  setDebugHitText(`已删除 #${id}`);
}

function focusDebugMarker(marker) {
  if (!marker) {
    return;
  }

  const eye = new THREE.Vector3(marker.x, firstPersonGroundEyeY(), marker.z);
  const target = new THREE.Vector3(marker.x, marker.y + 0.8, marker.z);
  camera.position.copy(eye);
  syncFirstPersonAnglesFromLook(eye, target);
}

function moveGrandpaToMarker(marker) {
  if (!marker || !grandpaRoot) {
    return false;
  }

  return placeGrandpaAt(marker);
}

function placeGrandpaAt(marker) {
  if (!marker || !grandpaRoot) {
    return false;
  }

  grandpaRoot.position.set(marker.x, marker.y + grandpaPreview.groundLift, marker.z);
  return true;
}

function placeGrandpaAtSpawn() {
  return placeGrandpaAt(spaceMarkers.grandpaSpawn);
}

function createGrandpaCharacter() {
  resetGrandpaRig();

  const root = new THREE.Group();
  root.name = 'Grandpa';
  root.userData.spawnMarker = spaceMarkers.grandpaSpawn;

  const facing = new THREE.Group();
  facing.name = 'GrandpaFacing';
  root.add(facing);

  const motion = new THREE.Group();
  motion.name = 'GrandpaMotion';
  facing.add(motion);

  grandpaRig.parts.facing = facing;
  grandpaRig.parts.motion = motion;

  const head = addGrandpaMesh(
    motion,
    'GrandpaHead',
    new THREE.SphereGeometry(0.22, 14, 10),
    'skin',
    [0, 1.55, 0.01],
    [1, 1.05, 0.92],
  );
  const hair = addGrandpaMesh(
    head,
    'GrandpaHair',
    new THREE.SphereGeometry(0.225, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
    'hair',
    [0, 0.06, -0.01],
    [1.04, 0.78, 1],
  );
  const body = addGrandpaMesh(
    motion,
    'GrandpaBody',
    new THREE.CapsuleGeometry(0.24, 0.62, 5, 10),
    'coat',
    [0, 0.92, 0],
    [1.08, 1, 0.86],
  );
  const scarf = addGrandpaMesh(
    motion,
    'GrandpaScarf',
    new THREE.TorusGeometry(0.18, 0.035, 8, 16),
    'scarf',
    [0, 1.28, 0.005],
    [1.25, 0.55, 0.7],
    [Math.PI * 0.5, 0, 0],
  );
  const leftArm = addGrandpaLimb(
    motion,
    'GrandpaLeftArm',
    'sleeve',
    [-0.28, 1.12, 0],
    [0.06, 0.4, 0.06],
    [-0.03, -0.23, 0],
  );
  const rightArm = addGrandpaLimb(
    motion,
    'GrandpaRightArm',
    'sleeve',
    [0.29, 1.1, 0],
    [0.055, 0.36, 0.055],
    [0.02, -0.22, 0],
  );
  const leftLeg = addGrandpaLimb(
    motion,
    'GrandpaLeftLeg',
    'trousers',
    [-0.12, 0.58, 0],
    [0.07, 0.46, 0.07],
    [0, -0.28, 0],
  );
  const rightLeg = addGrandpaLimb(
    motion,
    'GrandpaRightLeg',
    'trousers',
    [0.12, 0.58, 0],
    [0.07, 0.46, 0.07],
    [0, -0.28, 0],
  );
  const leftFoot = addGrandpaMesh(leftLeg, 'GrandpaLeftFoot', new THREE.BoxGeometry(0.17, 0.07, 0.25), 'shoe', [0, -0.53, 0.06]);
  const rightFoot = addGrandpaMesh(rightLeg, 'GrandpaRightFoot', new THREE.BoxGeometry(0.17, 0.07, 0.25), 'shoe', [0, -0.53, 0.06]);
  const cane = addGrandpaLimb(
    motion,
    'GrandpaCane',
    'cane',
    [0.42, 0.92, -0.02],
    [0.022, 0.72, 0.022],
    [0, -0.42, 0],
    [0, 0, 0.18],
  );
  addGrandpaMesh(cane, 'GrandpaCaneHandle', new THREE.TorusGeometry(0.055, 0.014, 6, 12, Math.PI * 1.35), 'cane', [0.03, -0.07, 0], [1, 1, 1], [Math.PI * 0.5, 0, Math.PI * 0.1]);
  addGrandpaFace(head);

  grandpaRig.parts.head = head;
  grandpaRig.parts.body = body;
  grandpaRig.parts.leftArm = leftArm;
  grandpaRig.parts.rightArm = rightArm;
  grandpaRig.parts.leftLeg = leftLeg;
  grandpaRig.parts.rightLeg = rightLeg;
  grandpaRig.parts.leftFoot = leftFoot;
  grandpaRig.parts.rightFoot = rightFoot;
  grandpaRig.parts.cane = cane;
  grandpaRig.parts.scarf = scarf;

  prepareGrandpaForStylizedPreview(root);
  updateGrandpaMaterials(mode);
  return root;
}

function resetGrandpaRig() {
  grandpaRig.parts = {};
  grandpaRig.meshes = [];
  grandpaRig.materials = {};
  grandpaRig.phase = 0;
  grandpaRig.walkBlend = 0;
}

// ===== 双时期爷爷 GLB 模型 =====

function grandpaPeriodForMode(activeMode) {
  // 最开始的正常画面（贴图平涂）用正常爷爷；进入风格化画面用风格化爷爷。
  return activeMode === 'texture' ? 'normal' : 'stylized';
}

async function loadGrandpaModelScene(url) {
  const gltf = await loadGltfWithFallback([url]);
  const obj = gltf.scene;
  obj.name = 'GrandpaModel'; // 命中 isGrandpaObject（含 'grandpa'），走爷爷 toon 材质
  obj.traverse((object) => {
    if (object.isMesh) {
      object.frustumCulled = false; // 骨骼形变可能超出绑定姿态包围球，避免误剔除
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  const clip = gltf.animations?.[0] ?? null;
  const mixer = new THREE.AnimationMixer(obj);
  if (clip) {
    mixer.clipAction(clip).play();
  }
  return { obj, mixer };
}

async function buildGrandpaPeriod(sources) {
  const idle = await loadGrandpaModelScene(sources.idle);
  const walk = await loadGrandpaModelScene(sources.walk);
  const group = new THREE.Group();
  group.name = 'GrandpaPeriod';
  group.add(idle.obj);
  group.add(walk.obj);
  walk.obj.visible = false;

  // 归一化：按 idle 包围盒缩放到目标身高，再把双脚抬到本地 y=0。
  const box = new THREE.Box3().setFromObject(idle.obj);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y > 0.001 ? size.y : 1;
  group.scale.setScalar(grandpaModel.targetHeight / height);
  group.rotation.y = grandpaModel.facingOffset;
  group.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(group);
  group.position.y = -scaledBox.min.y;
  return { group, idle, walk };
}

function applyGrandpaModelStyle(obj, activeMode) {
  obj.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    object.userData.skipStylize = true; // 不走场景级 stylizeObject；描边交给 OutlinePass
    object.userData.sourceMaterial ??= Array.isArray(object.material)
      ? [...object.material]
      : object.material;
    const source = object.userData.sourceMaterial;
    object.material = Array.isArray(source)
      ? source.map((material, index) => makeGrandpaToonMaterial(material, activeMode, object, index))
      : makeGrandpaToonMaterial(source, activeMode, object, 0);
  });
}

function applyGrandpaPeriodStyle(period, activeMode) {
  applyGrandpaModelStyle(period.idle.obj, activeMode);
  applyGrandpaModelStyle(period.walk.obj, activeMode);
}

function collectGrandpaOutline(root) {
  const outline = [];
  root.traverse((object) => {
    if (object.isMesh && object.geometry?.attributes?.normal) {
      outline.push(object);
    }
  });
  root.userData.outlineObjects = outline; // 隐藏的网格不会被 OutlinePass 描边
  syncOutlineObjects();
}

async function createGrandpaModelRig() {
  const root = new THREE.Group();
  root.name = 'Grandpa';
  root.userData.spawnMarker = spaceMarkers.grandpaSpawn;

  const normal = await buildGrandpaPeriod(grandpaModel.sources.normal);
  const stylized = await buildGrandpaPeriod(grandpaModel.sources.stylized);
  root.add(normal.group);
  root.add(stylized.group);

  grandpaModel.periods = { normal, stylized };
  grandpaModel.enabled = true;
  grandpaModel.active = grandpaPeriodForMode(mode);
  normal.group.visible = grandpaModel.active === 'normal';
  stylized.group.visible = grandpaModel.active === 'stylized';

  applyGrandpaPeriodStyle(normal, 'texture');
  applyGrandpaPeriodStyle(stylized, mode === 'texture' ? 'palette' : mode);
  collectGrandpaOutline(root);
  return root;
}

function setGrandpaModelForMode(activeMode) {
  if (!grandpaModel.enabled) {
    return;
  }
  const period = grandpaPeriodForMode(activeMode);
  const target = grandpaModel.periods[period];
  if (!target) {
    return;
  }
  if (grandpaModel.active !== period) {
    grandpaModel.active = period;
    Object.entries(grandpaModel.periods).forEach(([key, value]) => {
      value.group.visible = key === period;
    });
    sceneCache.grandpaPickObjects = null;
  }
  applyGrandpaPeriodStyle(target, activeMode);
}

function updateGrandpaModelAnimation(deltaSeconds) {
  const period = grandpaModel.periods[grandpaModel.active];
  if (!period) {
    return;
  }
  const targetBlend = grandpaState.moving ? 1 : 0;
  const blendSpeed = grandpaState.moving ? 7.5 : 5.5;
  grandpaRig.walkBlend += (targetBlend - grandpaRig.walkBlend) * Math.min(1, deltaSeconds * blendSpeed);

  const showWalk = grandpaRig.walkBlend > 0.5;
  if (period.walk.obj.visible !== showWalk) {
    period.walk.obj.visible = showWalk;
    period.idle.obj.visible = !showWalk;
    sceneCache.grandpaPickObjects = null;
  }
  (showWalk ? period.walk.mixer : period.idle.mixer).update(deltaSeconds);
}

function addGrandpaLimb(parent, name, materialKeyName, position, capsuleScale, meshOffset, rotation = [0, 0, 0]) {
  const pivot = new THREE.Group();
  pivot.name = `${name}Pivot`;
  pivot.position.set(...position);
  pivot.rotation.set(...rotation);
  parent.add(pivot);

  const [radius, length, depthRadius] = capsuleScale;
  const mesh = addGrandpaMesh(
    pivot,
    name,
    new THREE.CapsuleGeometry(radius, length, 4, 8),
    materialKeyName,
    meshOffset,
    [1, 1, depthRadius / radius],
  );
  return pivot;
}

function addGrandpaMesh(parent, name, geometry, materialKeyName, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const material = getGrandpaMaterial(materialKeyName, mode);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.rotation.set(...rotation);
  mesh.frustumCulled = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.skipStylize = true;
  mesh.userData.stylizedCharacter = true;
  mesh.userData.grandpaMaterialKey = materialKeyName;
  parent.add(mesh);
  grandpaRig.meshes.push(mesh);
  return mesh;
}

function addGrandpaFace(head) {
  addGrandpaMesh(head, 'GrandpaLeftEye', new THREE.SphereGeometry(0.018, 8, 6), 'ink', [-0.075, 0.035, 0.185], [1, 1, 0.45]);
  addGrandpaMesh(head, 'GrandpaRightEye', new THREE.SphereGeometry(0.018, 8, 6), 'ink', [0.075, 0.035, 0.185], [1, 1, 0.45]);
  addGrandpaMesh(head, 'GrandpaNose', new THREE.SphereGeometry(0.03, 8, 6), 'skinShadow', [0, -0.005, 0.205], [0.82, 1, 0.65]);
  addGrandpaMesh(head, 'GrandpaMouth', new THREE.BoxGeometry(0.095, 0.012, 0.012), 'ink', [0, -0.075, 0.198], [1, 1, 1]);
}

function getGrandpaMaterial(materialKeyName, activeMode) {
  const cacheKey = `${activeMode}:${materialKeyName}`;
  if (grandpaRig.materials[cacheKey]) {
    return grandpaRig.materials[cacheKey];
  }

  const material = new THREE.MeshToonMaterial({
    name: `grandpa_${materialKeyName}_${activeMode}`,
    color: grandpaPartColor(materialKeyName, activeMode),
    gradientMap: toonGradient,
  });

  if (activeMode === 'night') {
    material.emissive = new THREE.Color(0x111824);
    material.emissiveIntensity = materialKeyName === 'scarf' ? 0.18 : 0.08;
  }

  grandpaRig.materials[cacheKey] = material;
  return material;
}

function grandpaPartColor(materialKeyName, activeMode) {
  const colors = grandpaPartColors[activeMode] ?? grandpaPartColors.palette;
  return new THREE.Color(colors[materialKeyName] ?? colors.coat);
}

function updateGrandpaMaterials(activeMode) {
  for (const mesh of grandpaRig.meshes) {
    const materialKeyName = mesh.userData.grandpaMaterialKey;
    if (materialKeyName) {
      mesh.material = getGrandpaMaterial(materialKeyName, activeMode);
    }
  }
}

function prepareGrandpaForStylizedPreview(root) {
  root.userData.spawnMarker = spaceMarkers.grandpaSpawn;
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    object.frustumCulled = true;
    object.castShadow = false;
    object.receiveShadow = false;
    object.userData.skipStylize = true;
    object.userData.stylizedCharacter = true;
  });
}

function grandpaDebugState() {
  if (!grandpaRoot) {
    return null;
  }

  const materialNames = [];
  grandpaRoot.traverse((object) => {
    if (!object.isMesh) {
      return;
    }

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material?.name) {
        materialNames.push(material.name);
      }
    }
  });

  return {
    position: {
      x: roundMarkerValue(grandpaRoot.position.x),
      y: roundMarkerValue(grandpaRoot.position.y),
      z: roundMarkerValue(grandpaRoot.position.z),
    },
    scale: roundMarkerValue(grandpaRoot.scale.x),
    styleMode: mode,
    held: grandpaState.held,
    lost: grandpaState.lost,
    autoWalking: grandpaState.autoWalking,
    materials: [...new Set(materialNames)],
    spawnMarker: { ...spaceMarkers.grandpaSpawn },
  };
}

function firstPersonDebugState() {
  return {
    position: {
      x: roundMarkerValue(camera.position.x),
      y: roundMarkerValue(camera.position.y),
      z: roundMarkerValue(camera.position.z),
    },
    yaw: roundMarkerValue(firstPersonInput.yaw),
    pitch: roundMarkerValue(firstPersonInput.pitch),
    playerSpawn: { ...spaceMarkers.playerSpawn },
    eyeHeight: firstPersonPreview.eyeHeight,
    pointerLocked: firstPersonInput.pointerLocked,
  };
}

function collisionDebugState() {
  return { ...worldCollisionStats };
}

function findDebugMarker(id) {
  const markerId = Number(id);
  return debugMarkers.find((marker) => marker.id === markerId) ?? null;
}

function cloneDebugMarker(marker) {
  return {
    id: marker.id,
    x: marker.x,
    y: marker.y,
    z: marker.z,
    surface: marker.surface,
    note: marker.note,
  };
}

function formatMarkerCoords(marker) {
  return `x:${marker.x.toFixed(2)} y:${marker.y.toFixed(2)} z:${marker.z.toFixed(2)}`;
}

function roundMarkerValue(value) {
  return Number(value.toFixed(3));
}

function setDebugHitText(text) {
  if (debugHitEl) {
    debugHitEl.textContent = text;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function disposeDebugObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.map?.dispose();
      material?.dispose?.();
    }
  });
}

function setMode(nextMode) {
  mode = nextMode;
  applySky(mode);
  applyLighting(mode);
  updateSunRig(worldRoot, mode);
  if (worldRoot) stylizeObject(worldRoot, mode);
  if (lodRoot) stylizeObject(lodRoot, mode);
  if (grandpaRoot) {
    if (grandpaModel.enabled) {
      setGrandpaModelForMode(mode); // 切正常/风格化时期 + 按模式重新着色
    } else {
      updateGrandpaMaterials(mode);
    }
  }
  updateStylizedLightAccents(worldRoot, mode);
  updateWorldClouds(worldRoot, mode);
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });
}

// 剧情驱动的模式切换：柔光遮罩淡入→峰值时硬切材质→淡出，形成柔和过场。
function transitionToMode(target, fadeMs = 800) {
  if (mode === target && !modeSwapTimer) {
    return;
  }
  if (!modeFadeEl) {
    setMode(target);
    return;
  }
  const half = Math.max(120, Math.round(fadeMs / 2));
  window.clearTimeout(modeSwapTimer);
  modeFadeEl.style.transitionDuration = `${half}ms`;
  // 触发淡入
  requestAnimationFrame(() => {
    modeFadeEl.style.opacity = '1';
  });
  modeSwapTimer = window.setTimeout(() => {
    setMode(target);
    modeFadeEl.style.opacity = '0';
    modeSwapTimer = 0;
  }, half);
}

function scheduleModeRevert(delayMs, fadeMs = 5000) {
  window.clearTimeout(modeRevertTimer);
  modeRevertTimer = window.setTimeout(() => {
    transitionToMode('texture', fadeMs);
  }, delayMs);
}

buttons.forEach((button) => {
  button.addEventListener('click', () => setMode(button.dataset.mode));
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  configureRenderQuality();
  renderer.setPixelRatio(runtimeConfig.dpr);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(runtimeConfig.composerDpr);
  composer.setSize(width, height);
  outlinePass.enabled = runtimeConfig.outlineEnabled;
  outlinePass.setSize(width, height);
}

window.addEventListener('resize', resize);
resize();

function setStatus(message) {
  statusEl.textContent = message;
}

function getCurrentObjectiveTarget() {
  if (!gameUiState.started) return null;
  if (grandpaState.lost) return grandpaRoot?.position ?? null;
  if (!gameUiState.level1Complete) return grandpaRoot?.position ?? null;
  if (!mailboxTaskState.completed) return markerVector(spaceMarkers.mailboxTask);
  if (!schoolTaskState.completed) return markerVector(spaceMarkers.schoolTask);
  if (!homeTaskState.completed) return markerVector(spaceMarkers.grandpaHomeTask);
  return null;
}

function updateObjectiveArrow() {
  if (!objectiveArrowEl) return;
  const target = getCurrentObjectiveTarget();
  if (!target || debugActive || isQuestPanelOpen()) {
    objectiveArrowEl.hidden = true;
    return;
  }

  const dx = target.x - camera.position.x;
  const dz = target.z - camera.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 3) {
    objectiveArrowEl.hidden = true;
    return;
  }

  const angleToTarget = Math.atan2(dx, dz);
  const relAngle = angleToTarget - firstPersonInput.yaw;
  const screenX = Math.sin(relAngle);
  const screenY = -Math.cos(relAngle);
  const margin = 62;
  const clampedX = Math.max(
    margin,
    Math.min(window.innerWidth - margin, window.innerWidth / 2 + screenX * (window.innerWidth / 2 - margin)),
  );
  const clampedY = Math.max(
    margin + 44,
    Math.min(window.innerHeight - margin - 80, window.innerHeight / 2 - screenY * (window.innerHeight / 2 - margin)),
  );

  objectiveArrowEl.hidden = false;
  objectiveArrowEl.style.left = `${clampedX}px`;
  objectiveArrowEl.style.top = `${clampedY}px`;
  objectiveArrowEl.style.transform = `translate(-50%, -50%) rotate(${relAngle * 180 / Math.PI}deg)`;
  if (objectiveDistanceEl) {
    objectiveDistanceEl.textContent = distance > 10 ? `${Math.round(distance)}m` : '';
  }
}

function initLifecycleHandlers() {
  document.addEventListener('visibilitychange', () => {
    syncRuntimePause();
    firstPersonInput.lastFrameTime = performance.now();
    if (document.hidden) {
      firstPersonInput.keys.clear();
      mobileInput.activeMoveButtons.clear();
      updateMobileJoystickVector();
      releaseImmersiveMode();
      stopMotionSensor();
    } else if (
      runtimeConfig.isMobile
      && mobileInput.mode === 'sensor'
      && mobileInput.sensorPermission === 'granted'
      && gameUiState.started
      && !mobileInput.sensorListening
    ) {
      sensorBus.start()
        .then(() => startMotionSensor())
        .catch((error) => {
          console.warn('Motion sensor resume failed', error);
          setMobileControlMode('desktop-touch', '体感恢复失败。可拖动右侧看向，连接键盘或换桌面继续。');
        });
    }
  });

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    performanceStats.contextLost = true;
    performanceStats.paused = true;
    setStatus('WebGL context lost. Reload the page to recover.');
  });

  canvas.addEventListener('webglcontextrestored', () => {
    performanceStats.contextLost = false;
    syncRuntimePause();
    firstPersonInput.lastFrameTime = performance.now();
    resize();
    setStatus('WebGL context restored.');
  });
}

function updatePerformanceStats(now) {
  performanceStats.frameCount += 1;
  const elapsed = now - performanceStats.lastFpsAt;
  if (elapsed >= 1000) {
    performanceStats.fps = (performanceStats.frameCount * 1000) / elapsed;
    performanceStats.frameCount = 0;
    performanceStats.lastFpsAt = now;
  }
}

async function loadScene() {
  const sceneLoadStart = performance.now();
  const sceneCandidates = runtimeConfig.sceneVariant === 'full'
    ? [
        '/web/generated/Demo0620_1_webtoon.gltf',
        '/web/generated/Demo0620_1_webtoon_mobile.gltf',
        '/web/generated/Demo0620_1_webtoon_mobile_meshopt.gltf',
      ]
    : [
        '/web/generated/Demo0620_1_webtoon_mobile_meshopt.gltf',
        '/web/generated/Demo0620_1_webtoon_mobile.gltf',
        '/web/generated/Demo0620_1_webtoon.gltf',
      ];
  const gltf = await loadGltfWithFallback(sceneCandidates, (event) => {
    if (!event.total) return;
    const percent = Math.round((event.loaded / event.total) * 100);
    setLoadingProgress(Math.min(96, percent));
    setStatus(`正在加载场景 ${percent}%`);
  });
  performanceStats.sceneLoadMs = performance.now() - sceneLoadStart;

  worldRoot = gltf.scene;
  worldRoot.name = 'HuaianTown';
  worldRoot.rotation.y = Math.PI;
  sanitizeRuntimeGeometryAttributes(worldRoot);
  neutralizeImportedSky(worldRoot);
  scene.add(worldRoot);

  rebuildSceneCaches(worldRoot);
  frameObject(worldRoot);
  updateSunRig(worldRoot, mode);
  stylizeObject(worldRoot, mode);
  addMemoryRoute();
  addLocationLabels();
  updateStylizedLightAccents(worldRoot, mode);
  updateWorldClouds(worldRoot, mode);
  createMailboxHotspot();
  createSchoolHotspot();
  createHomeHotspot();
  refreshObjectiveReveal();
  setFirstPersonSpawnView();
  updatePlayerColliderFromCamera();
  setStatus(sceneReadyStatus());
  markSceneReady();
  loadWorldCollision()
    .then(() => updatePlayerColliderFromCamera())
    .catch((error) => console.warn('Background collision load failed', error));

  const grandpaCreateStart = performance.now();
  try {
    grandpaRoot = await createGrandpaModelRig(); // 双时期 GLB 爷爷
  } catch (error) {
    console.warn('Grandpa GLB load failed, fallback to procedural grandpa', error);
    grandpaModel.enabled = false;
    grandpaRoot = createGrandpaCharacter();
    grandpaRoot.scale.setScalar(grandpaPreview.scale);
  }
  placeGrandpaAtSpawn();
  faceGrandpaToward(markerVector(spaceMarkers.hennessyRoad1));
  scene.add(grandpaRoot);
  sceneCache.grandpaPickObjects = null;
  performanceStats.grandpaLoadMs = performance.now() - grandpaCreateStart;
}

async function loadLodScene() {
  if (!runtimeConfig.isMobile || runtimeConfig.sceneVariant === 'full') {
    return;
  }

  const startedAt = performance.now();
  const gltf = await loader.loadAsync('/web/generated/Demo1_LOD_mobile.gltf');
  lodRoot = gltf.scene;
  lodRoot.name = 'HuaianTownLOD';
  lodRoot.rotation.y = Math.PI;
  lodRoot.visible = false;
  lodRoot.userData.skipStylize = false;
  lodRoot.userData.excludeFromBounds = true;
  sanitizeRuntimeGeometryAttributes(lodRoot);
  scene.add(lodRoot);
  stylizeObject(lodRoot, mode);
  performanceStats.lodLoadMs = performance.now() - startedAt;
  lodSceneStats = {
    loaded: true,
    visible: lodRoot.visible,
    meshes: countMeshes(lodRoot),
  };
}

function queueLodLoad() {
  if (lodLoadQueued) {
    return;
  }
  lodLoadQueued = true;
  deferNonCriticalAssetLoad(() => {
    loadLodScene().catch((error) => console.warn('LOD scene load skipped', error));
  }, 3200);
}

function deferNonCriticalAssetLoad(callback, timeoutMs = 1600) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout: timeoutMs });
    return;
  }
  window.setTimeout(callback, timeoutMs);
}

function countMeshes(root) {
  let count = 0;
  root?.traverse((object) => {
    if (object.isMesh) {
      count += 1;
    }
  });
  return count;
}

function sceneReadyStatus() {
  if (runtimeConfig.isMobile && mobileInput.mode === 'joystick') {
    return '场景已载入。使用摇杆移动，拖动右侧调整视角。';
  }
  if (runtimeConfig.isMobile && mobileInput.mode === 'sensor') {
    return '场景已载入。轻触画面启用步行感应。';
  }
  return '场景已载入。点击画面后使用 WASD 行走。';
}

async function loadGltfWithFallback(urls, onProgress) {
  let lastError;
  for (const url of urls) {
    try {
      return await loader.loadAsync(url, onProgress);
    } catch (error) {
      lastError = error;
      console.warn(`Failed to load ${url}`, error);
    }
  }
  throw lastError ?? new Error('No load candidates provided');
}

loadScene().catch((error) => {
  console.error(error);
  setStatus(`加载失败：${error.message}`);
  markSceneLoadFailed(`加载失败：${error.message}`);
});

renderer.setAnimationLoop(() => {
  const now = performance.now();
  updatePerformanceStats(now);
  if (performanceStats.paused || performanceStats.contextLost) {
    firstPersonInput.lastFrameTime = now;
    return;
  }

  const deltaSeconds = Math.min((now - firstPersonInput.lastFrameTime) / 1000, 0.05);
  firstPersonInput.lastFrameTime = now;
  updateFirstPersonMovement(deltaSeconds);
  updateMailboxProximity();
  updateSchoolProximity();
  updateHomeProximity();
  updateGrandpa(deltaSeconds);
  updateListenTask(deltaSeconds);
  updateCompanionStress(deltaSeconds);
  updateObjectiveArrow();
  updateLocationLabelOcclusion();
  if (runtimeConfig.outlineEnabled) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
});
