import './style.css';
import { slidesFromPdf, slidesFromImages, demoSlides } from './slides.js';
import { GestureController } from './gestures.js';
import { pingBridge, sendRemoteKey } from './remote-bridge.js';
import { OnboardingFlow } from './onboarding.js';

const uploadScreen = document.querySelector('#upload-screen');
const presenterScreen = document.querySelector('#presenter-screen');
const dropzone = document.querySelector('#dropzone');
const fileInput = document.querySelector('#file-input');
const pickFileBtn = document.querySelector('#pick-file-btn');
const demoBtn = document.querySelector('#demo-btn');
const uploadStatus = document.querySelector('#upload-status');

const slideImage = document.querySelector('#slide-image');
const slideCounter = document.querySelector('#slide-counter');
const gestureToast = document.querySelector('#gesture-toast');
const prevBtn = document.querySelector('#prev-btn');
const nextBtn = document.querySelector('#next-btn');
const fullscreenBtn = document.querySelector('#fullscreen-btn');
const exitBtn = document.querySelector('#exit-btn');
const cameraToggleBtn = document.querySelector('#camera-toggle-btn');
const cameraPip = document.querySelector('#camera-pip');
const cameraVideo = document.querySelector('#camera-video');
const cameraCanvas = document.querySelector('#camera-canvas');
const gestureStatus = document.querySelector('#gesture-status');
const remoteToggleBtn = document.querySelector('#remote-toggle-btn');
const replayOnboardingBtn = document.querySelector('#replay-onboarding-btn');

let slides = [];
let currentIndex = 0;
let gestureController = null;
let remoteMode = false;

function setUploadStatus(text) {
  uploadStatus.textContent = text;
}

async function openPresenter(loadedSlides) {
  slides = loadedSlides;
  currentIndex = 0;
  uploadScreen.classList.add('hidden');
  presenterScreen.classList.remove('hidden');
  renderSlide();
}

function renderSlide() {
  slideImage.src = slides[currentIndex];
  slideCounter.textContent = `${currentIndex + 1} / ${slides.length}`;
}

function goTo(direction) {
  if (remoteMode) sendRemoteKey(direction).catch((err) => console.error('Bridge:', err));

  const next = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
  if (slides.length > 0 && next >= 0 && next < slides.length) {
    currentIndex = next;
    renderSlide();
  }
  flashToast(direction);
}

function flashToast(direction) {
  gestureToast.textContent = direction === 'next' ? '→' : '←';
  gestureToast.classList.add('show');
  clearTimeout(flashToast.timer);
  flashToast.timer = setTimeout(() => gestureToast.classList.remove('show'), 350);
}

function exitPresenter() {
  if (gestureController) {
    gestureController.stop();
    gestureController = null;
    cameraPip.classList.add('hidden');
    cameraToggleBtn.textContent = 'Activar cámara';
  }
  remoteMode = false;
  remoteToggleBtn.textContent = 'Modo remoto: OFF';
  remoteToggleBtn.classList.remove('active');
  presenterScreen.classList.add('hidden');
  uploadScreen.classList.remove('hidden');
  setUploadStatus('');
}

async function handleFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;

  try {
    if (files.length === 1 && files[0].type === 'application/pdf') {
      setUploadStatus('Leyendo PDF...');
      const loaded = await slidesFromPdf(files[0]);
      setUploadStatus('');
      await openPresenter(loaded);
      return;
    }

    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      setUploadStatus('Sube un PDF o imágenes (PNG/JPG/WebP).');
      return;
    }
    setUploadStatus('Cargando imágenes...');
    const loaded = await slidesFromImages(images);
    setUploadStatus('');
    await openPresenter(loaded);
  } catch (err) {
    console.error(err);
    setUploadStatus('No se pudo cargar el archivo. Intenta de nuevo.');
  }
}

pickFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

demoBtn.addEventListener('click', () => openPresenter(demoSlides()));

['dragenter', 'dragover'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add('drag-over');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
  })
);
dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

prevBtn.addEventListener('click', () => goTo('prev'));
nextBtn.addEventListener('click', () => goTo('next'));
exitBtn.addEventListener('click', exitPresenter);

fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    presenterScreen.requestFullscreen?.();
  }
});

document.addEventListener('keydown', (e) => {
  if (presenterScreen.classList.contains('hidden')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') goTo('next');
  if (e.key === 'ArrowLeft') goTo('prev');
  if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
});

remoteToggleBtn.addEventListener('click', async () => {
  if (remoteMode) {
    remoteMode = false;
    remoteToggleBtn.textContent = 'Modo remoto: OFF';
    remoteToggleBtn.classList.remove('active');
    return;
  }

  remoteToggleBtn.textContent = 'Conectando...';
  const reachable = await pingBridge();
  if (!reachable) {
    remoteToggleBtn.textContent = 'Modo remoto: OFF';
    setUploadStatus('');
    gestureStatus.textContent = 'Puente no encontrado (corre "npm run remote")';
    gestureStatus.classList.add('error');
    return;
  }

  remoteMode = true;
  remoteToggleBtn.textContent = 'Modo remoto: ON';
  remoteToggleBtn.classList.add('active');
});

cameraToggleBtn.addEventListener('click', async () => {
  if (gestureController) {
    gestureController.stop();
    gestureController = null;
    cameraPip.classList.add('hidden');
    cameraToggleBtn.textContent = 'Activar cámara';
    return;
  }

  cameraPip.classList.remove('hidden');
  cameraToggleBtn.textContent = 'Desactivar cámara';
  gestureController = new GestureController({
    video: cameraVideo,
    canvas: cameraCanvas,
    onSwipe: goTo,
    onStatus: (state, text) => {
      gestureStatus.textContent = text;
      gestureStatus.classList.toggle('active', state === 'active');
      gestureStatus.classList.toggle('error', state === 'error');
    },
  });

  try {
    await gestureController.start();
  } catch (err) {
    console.error(err);
    gestureStatus.textContent = 'No se pudo acceder a la cámara';
    gestureStatus.classList.add('error');
    cameraPip.classList.add('hidden');
    cameraToggleBtn.textContent = 'Activar cámara';
    gestureController = null;
  }
});

const onboarding = new OnboardingFlow({
  onComplete: () => uploadScreen.classList.remove('hidden'),
});

replayOnboardingBtn.addEventListener('click', () => {
  uploadScreen.classList.add('hidden');
  onboarding.start();
});

if (onboarding.shouldAutoStart()) {
  onboarding.start();
} else {
  uploadScreen.classList.remove('hidden');
}
