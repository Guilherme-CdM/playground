import { SAVE_KEY, SAVE_SCHEMA, VERSION } from '../config.js';
import { hashString } from '../utils/math.js';

function checksum(payload) {
  return hashString(JSON.stringify(payload));
}

export function serializeSave(state) {
  const payload = {
    schema: SAVE_SCHEMA,
    version: VERSION,
    savedAt: Date.now(),
    state,
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify({
    ...payload,
    checksum: checksum(payload),
  }))));
}

export function deserializeSave(raw) {
  const decoded = JSON.parse(decodeURIComponent(escape(atob(raw))));
  const { checksum: stored, ...payload } = decoded;
  if (stored !== checksum(payload)) {
    throw new Error('Save checksum mismatch');
  }
  if (payload.schema > SAVE_SCHEMA) {
    throw new Error('Save schema is newer than the game build');
  }
  return payload;
}

export function loadLocalSave() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return deserializeSave(raw);
  } catch (err) {
    console.warn('Failed to load save:', err);
    return null;
  }
}

export function storeLocalSave(state) {
  const raw = serializeSave(state);
  localStorage.setItem(SAVE_KEY, raw);
  return raw;
}

export function clearLocalSave() {
  localStorage.removeItem(SAVE_KEY);
}
