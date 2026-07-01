const BRIDGE_URL = 'http://localhost:5731';
const KEY_BY_DIRECTION = { next: 'ArrowRight', prev: 'ArrowLeft' };

export async function pingBridge() {
  try {
    const res = await fetch(`${BRIDGE_URL}/ping`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendRemoteKey(direction) {
  const key = KEY_BY_DIRECTION[direction];
  if (!key) return;
  await fetch(`${BRIDGE_URL}/press`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}
