import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function slidesFromPdf(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const slides = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    slides.push(canvas.toDataURL('image/png'));
  }

  return slides;
}

export function slidesFromImages(files) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return Promise.all(sorted.map((file) => readFileAsDataUrl(file)));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const INK = '#eae7e0';
const BG = '#131210';
const ACCENT = '#a8402c';

export function demoSlides() {
  const titles = [
    'low signal',
    'enciende la cámara',
    '↑ desliza hacia arriba',
    '↓ desliza hacia abajo',
    'sin tocar el teclado',
  ];

  return titles.map((title, i) => drawDemoSlide(title, i + 1, titles.length));
}

function drawDemoSlide(title, number, total) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#2c2a26';
  ctx.lineWidth = 1;
  ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(120, 120, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.font = '400 72px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 20);

  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillStyle = '#8f8a80';
  ctx.fillText(`${number} / ${total}`, canvas.width / 2, canvas.height / 2 + 60);

  return canvas.toDataURL('image/png');
}
