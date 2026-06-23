const SAVE_KEY = 'last-letter-save-v1';

function saveGameProgress(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Save failed', error);
  }
}

function loadGameProgress() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.warn('Load failed', error);
    return null;
  }
}

function clearGameProgress() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {}
}

export { saveGameProgress, loadGameProgress, clearGameProgress };
