import { createServer } from 'node:http';
import { exec } from 'node:child_process';

const PORT = 5731;
const KEY_CODES = { ArrowRight: 124, ArrowLeft: 123 };

if (process.platform !== 'darwin') {
  console.error('El puente de "low signal" solo soporta macOS por ahora (usa System Events vía osascript).');
  process.exit(1);
}

function pressKey(key) {
  const code = KEY_CODES[key];
  if (code === undefined) return Promise.reject(new Error(`Tecla no soportada: ${key}`));
  const script = `tell application "System Events" to key code ${code}`;
  return new Promise((resolve, reject) => {
    exec(`osascript -e '${script}'`, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/press') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { key } = JSON.parse(body || '{}');
        await pressKey(key);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err.message ?? err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`low signal · puente remoto escuchando en http://localhost:${PORT}`);
  console.log('Da foco a la ventana que quieras controlar (Canva, PowerPoint, Keynote...) antes de gesticular.');
  console.log('Si no funciona: System Settings > Privacy & Security > Accessibility, y da permiso a Terminal (o al binario de node).');
});
