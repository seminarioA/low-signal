import { GestureController } from './gestures.js';

const SEEN_KEY = 'low-signal:onboarding-seen';
const STEP_ORDER = [0, 1, 4];

export class OnboardingFlow {
  constructor({ onComplete }) {
    this.onComplete = onComplete;
    this.controller = null;
    this.phase = 'enable';
    this.stepIndex = 0;

    this.screen = document.querySelector('#onboarding-screen');
    this.progressEl = document.querySelector('#onboarding-progress');
    this.steps = new Map(
      [...document.querySelectorAll('.onboarding-step')].map((el) => [Number(el.dataset.step), el])
    );

    this.cameraBtn = document.querySelector('#onboarding-camera-btn');
    this.cameraTitle = document.querySelector('#onboarding-camera-title');
    this.cameraCopy = document.querySelector('#onboarding-camera-copy');
    this.hint = document.querySelector('#onboarding-hint');
    this.arrow = document.querySelector('#onboarding-arrow');
    this.video = document.querySelector('#onboarding-video');
    this.canvas = document.querySelector('#onboarding-canvas');

    document.querySelector('#onboarding-skip').addEventListener('click', () => this.finish());
    document.querySelector('[data-action="next"]').addEventListener('click', () => this.goToStep(1));
    document.querySelector('[data-action="finish"]').addEventListener('click', () => this.finish());
    this.cameraBtn.addEventListener('click', () => this.enableCamera());
  }

  shouldAutoStart() {
    return !localStorage.getItem(SEEN_KEY);
  }

  start() {
    this.stepIndex = 0;
    this.phase = 'enable';
    this.cameraBtn.classList.remove('hidden');
    this.arrow.classList.add('hidden');
    this.arrow.textContent = '';
    this.hint.textContent = '';
    this.cameraTitle.textContent = 'enciende la cámara';
    this.cameraCopy.textContent = 'Se procesa en tu navegador. Nada se sube a un servidor.';
    this.renderStep();
    this.screen.classList.remove('hidden');
  }

  renderStep() {
    for (const [step, el] of this.steps) {
      el.classList.toggle('hidden', step !== STEP_ORDER[this.stepIndex]);
    }
    this.progressEl.innerHTML = '';
    STEP_ORDER.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'dot';
      if (i < this.stepIndex) dot.classList.add('done');
      if (i === this.stepIndex) dot.classList.add('current');
      this.progressEl.appendChild(dot);
    });
  }

  goToStep(index) {
    this.stepIndex = index;
    this.renderStep();
  }

  async enableCamera() {
    this.cameraBtn.textContent = 'Conectando...';
    this.controller = new GestureController({
      video: this.video,
      canvas: this.canvas,
      onSwipe: (direction) => this.handleSwipe(direction),
      onStatus: (_state, text) => {
        if (this.phase === 'enable') this.hint.textContent = text;
      },
    });

    try {
      await this.controller.start();
      this.cameraBtn.classList.add('hidden');
      this.beginPractice('up');
    } catch (err) {
      console.error(err);
      this.cameraBtn.textContent = 'Activar cámara';
      this.hint.textContent = 'No se pudo acceder a la cámara. Revisa los permisos del navegador.';
    }
  }

  beginPractice(direction) {
    this.phase = direction;
    const isUp = direction === 'up';
    this.cameraTitle.textContent = isUp ? 'desliza hacia arriba' : 'desliza hacia abajo';
    this.cameraCopy.textContent = isUp
      ? 'Como quien scrollea en TikTok. Avanza a la siguiente slide.'
      : 'El mismo gesto, al revés. Vuelve a la slide anterior.';
    this.arrow.textContent = isUp ? '↑' : '↓';
    this.arrow.classList.remove('hidden', 'success');
    this.hint.textContent = `Muestra tu mano y desliza hacia ${isUp ? 'arriba' : 'abajo'}`;
  }

  handleSwipe(direction) {
    const expected = this.phase === 'up' ? 'next' : this.phase === 'down' ? 'prev' : null;
    if (!expected || direction !== expected) return;

    this.arrow.classList.add('success');
    this.hint.textContent = '¡Eso es!';

    setTimeout(() => {
      if (this.phase === 'up') {
        this.beginPractice('down');
      } else if (this.phase === 'down') {
        this.stopCamera();
        this.goToStep(2);
      }
    }, 500);
  }

  stopCamera() {
    if (this.controller) {
      this.controller.stop();
      this.controller = null;
    }
  }

  finish() {
    this.stopCamera();
    localStorage.setItem(SEEN_KEY, '1');
    this.screen.classList.add('hidden');
    this.onComplete();
  }
}
