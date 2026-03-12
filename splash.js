window.api.onProgress((data) => {
  const statusEl = document.getElementById('status-text');
  const progressEl = document.getElementById('progress-bar');
  
  if (data.message) {
    statusEl.textContent = data.message;
  }
  if (typeof data.progress === 'number') {
    progressEl.style.width = `${data.progress}%`;
  }
});
