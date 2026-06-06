const DEFAULT_PRIVATE_MESH_URL = 'http://127.0.0.1:8787';

const meshBaseUrl = () => (
  process.env.NEXT_PUBLIC_PRIVATE_MESH_URL
  ?? process.env.NEXT_PUBLIC_PRIVATE_MESH_SIGNAL_URL
  ?? DEFAULT_PRIVATE_MESH_URL
).replace(/\/+$/, '');

const stripHexPrefix = (value) => String(value ?? '').replace(/^0x/i, '');

const normalizeAddress = (value) => {
  const hex = stripHexPrefix(value).toLowerCase();
  return /^[0-9a-f]{40}$/.test(hex) ? `0x${hex}` : '';
};

const normalizeHex = (value) => {
  const hex = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2 !== 0) return '';
  return `0x${hex}`;
};

export function getPrivateMeshUrl() {
  return meshBaseUrl();
}

export function buildSignalFrame(recipient, encryptedData) {
  const address = normalizeAddress(recipient);
  const payload = normalizeHex(encryptedData);
  if (!address) throw new Error('Signal recipient address must be a 20-byte hex address.');
  if (!payload || payload === '0x') throw new Error('Signal payload must be non-empty hex.');
  return `0x${stripHexPrefix(address)}${stripHexPrefix(payload)}`;
}

export async function publishPrivateMeshSignals(signals) {
  const frames = signals.map(({ recipient, encryptedData }) => buildSignalFrame(recipient, encryptedData));
  const response = await fetch(`${meshBaseUrl()}/signal`, {
    method: 'PUT',
    headers: {
      'content-type': 'text/plain; charset=utf-8',
    },
    body: frames.join('\n'),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Private Mesh signal failed (${response.status})${text ? `: ${text}` : ''}`);
  }

  return response.json().catch(() => ({ accepted: true }));
}

export async function pollPrivateMeshSignals(recipient, { signal } = {}) {
  const address = normalizeAddress(recipient);
  if (!address) return [];

  const response = await fetch(`${meshBaseUrl()}/signal?recipient=${encodeURIComponent(address)}`, {
    method: 'GET',
    signal,
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Private Mesh poll failed (${response.status})${text ? `: ${text}` : ''}`);
  }

  const body = await response.json();
  return Array.isArray(body?.signals) ? body.signals : [];
}

export function subscribeToPrivateMeshSignals(recipient, onSignal) {
  const address = normalizeAddress(recipient);
  if (!address || typeof EventSource === 'undefined') return () => {};

  const source = new EventSource(`${meshBaseUrl()}/signal/stream?recipient=${encodeURIComponent(address)}`);
  source.addEventListener('signal', (event) => {
    try {
      onSignal(JSON.parse(event.data));
    } catch (error) {
      console.log('[RTC signal] Private Mesh event ignored:', error);
    }
  });
  source.onerror = (error) => {
    console.log('[RTC signal] Private Mesh stream error', error);
  };

  return () => {
    source.close();
  };
}
