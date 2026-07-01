import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const PALM_LANDMARK = 9; // middle finger MCP: punto estable del centro de la palma
const MIN_HAND_SCORE = 0.5;
const SWIPE_THRESHOLD = 0.22; // fracción de la altura del cuadro de cámara
const HISTORY_WINDOW_MS = 300;
const MIN_CONSISTENCY = 0.6; // fracción de tramos que deben moverse en la misma dirección
const MIN_RETRIGGER_MS = 350; // piso de seguridad entre disparos distintos
const STILL_EPSILON = 0.012; // cambio por frame que cuenta como "mano quieta"
const STILL_FRAMES_TO_REARM = 3; // frames quietos seguidos para permitir un nuevo swipe

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export class GestureController {
  constructor({ video, canvas, onSwipe, onStatus }) {
    this.video = video;
    this.canvas = canvas;
    this.onSwipe = onSwipe;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.stream = null;
    this.rafId = null;
    this.running = false;

    this.history = [];
    this.lastTriggerAt = 0;
    this.awaitingRelease = false;
    this.stillStreak = 0;
    this.lastY = null;
  }

  async start() {
    this.onStatus('loading', 'Cargando modelo...');
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 360, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    this.running = true;
    this.onStatus('active', 'Buscando mano...');
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    if (this.landmarker) this.landmarker.close();
    this.landmarker = null;
    this.stream = null;
    this.history = [];
    this.awaitingRelease = false;
    this.stillStreak = 0;
    this.lastY = null;
    this.onStatus('idle', 'Cámara apagada');
  }

  loop = () => {
    if (!this.running) return;

    if (this.video.readyState >= 2) {
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      this.processResult(result);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  processResult(result) {
    const ctx = this.canvas.getContext('2d');
    this.canvas.width = this.video.videoWidth || this.canvas.width;
    this.canvas.height = this.video.videoHeight || this.canvas.height;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const hand = result.landmarks?.[0];
    const handScore = result.handednesses?.[0]?.[0]?.score ?? 1;
    if (!hand || handScore < MIN_HAND_SCORE) {
      // perder la mano de cuadro también cuenta como el final de un gesto
      this.history = [];
      this.awaitingRelease = false;
      this.stillStreak = 0;
      this.lastY = null;
      this.onStatus('active', 'Buscando mano...');
      return;
    }

    drawHand(ctx, hand, this.canvas.width, this.canvas.height);
    this.onStatus('active', 'Desliza ↑ siguiente · ↓ anterior');
    this.trackSwipe(hand);
  }

  trackSwipe(hand) {
    const now = performance.now();
    const y = hand[PALM_LANDMARK].y;

    if (this.lastY !== null) {
      this.stillStreak = Math.abs(y - this.lastY) < STILL_EPSILON ? this.stillStreak + 1 : 0;
    }
    this.lastY = y;

    // Un swipe estilo TikTok es un movimiento continuo que suele durar más
    // que cualquier cooldown fijo: en vez de temporizar, esperamos a que la
    // mano se detenga (o salga de cuadro) antes de permitir el próximo swipe,
    // así un solo gesto largo no dispara dos veces.
    if (this.awaitingRelease) {
      if (this.stillStreak < STILL_FRAMES_TO_REARM) return;
      this.awaitingRelease = false;
      this.history = [];
    }

    this.history.push({ y, t: now });
    this.history = this.history.filter((sample) => now - sample.t <= HISTORY_WINDOW_MS);

    if (this.history.length < 4) return;
    if (now - this.lastTriggerAt < MIN_RETRIGGER_MS) return;

    const dy = this.history[this.history.length - 1].y - this.history[0].y;
    if (Math.abs(dy) < SWIPE_THRESHOLD) return;

    let consistent = 0;
    for (let i = 1; i < this.history.length; i++) {
      const step = this.history[i].y - this.history[i - 1].y;
      if (step === 0 || Math.sign(step) === Math.sign(dy)) consistent++;
    }
    if (consistent / (this.history.length - 1) < MIN_CONSISTENCY) return;

    this.lastTriggerAt = now;
    this.awaitingRelease = true;
    this.stillStreak = 0;
    this.history = [];
    this.onSwipe(dy < 0 ? 'next' : 'prev');
  }
}

function drawHand(ctx, hand, width, height) {
  ctx.strokeStyle = '#eae7e0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(hand[a].x * width, hand[a].y * height);
    ctx.lineTo(hand[b].x * width, hand[b].y * height);
  }
  ctx.stroke();

  ctx.fillStyle = '#a8402c';
  for (const point of hand) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
