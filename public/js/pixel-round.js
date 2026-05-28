// public/js/pixel-round.js — Logique de la manche Pixel (dépixelisation canvas)

let pixelCanvas  = null;
let pixelCtx     = null;
let pixelImg     = null;
let pixelImgOk   = false;
let pixelLevel   = 1;  // 1 = très pixelisé, 8 = net
let pixelTimer   = null;
const MAX_LEVEL  = 4;
const REVEAL_INTERVAL = 2500; // ms entre chaque dépixelisation

function initPixelCanvas(canvasId) {
  pixelCanvas = document.getElementById(canvasId);
  if (!pixelCanvas) return;
  pixelCtx    = pixelCanvas.getContext('2d');
  // Reset visuel du canvas à chaque init
  pixelCtx.fillStyle = '#0F0A1E';
  pixelCtx.fillRect(0, 0, pixelCanvas.width, pixelCanvas.height);
}

function loadPixelImage(url, onReady) {
  pixelLevel = 1;
  pixelImgOk = false;
  pixelImg   = new Image();
  pixelImg.crossOrigin = 'anonymous';

  // Sécurité : si l'image met trop de temps, on déclenche onerror manuellement
  const timeout = setTimeout(() => {
    if (!pixelImgOk) {
      console.warn('[pixel] image load timeout:', url);
      pixelImg.onerror?.();
    }
  }, 6000);

  pixelImg.onload  = () => {
    clearTimeout(timeout);
    pixelImgOk = true;
    drawPixelated(pixelLevel);
    if (onReady) onReady();
  };
  pixelImg.onerror = () => {
    clearTimeout(timeout);
    pixelImgOk = false;
    console.warn('[pixel] image failed to load:', url);
    drawErrorPlaceholder();
    if (onReady) onReady();
  };
  pixelImg.src = url;
}

function drawErrorPlaceholder() {
  if (!pixelCtx || !pixelCanvas) return;
  pixelCtx.fillStyle = '#1E1535';
  pixelCtx.fillRect(0, 0, pixelCanvas.width, pixelCanvas.height);
  pixelCtx.fillStyle = '#F97316';
  pixelCtx.font = 'bold 22px sans-serif';
  pixelCtx.textAlign = 'center';
  pixelCtx.fillText('🖼️ Image indisponible', pixelCanvas.width / 2, pixelCanvas.height / 2 - 8);
  pixelCtx.fillStyle = '#A78BFA';
  pixelCtx.font = '14px sans-serif';
  pixelCtx.fillText('(devine quand même !)', pixelCanvas.width / 2, pixelCanvas.height / 2 + 18);
}

function drawPixelated(level) {
  if (!pixelImgOk) { drawErrorPlaceholder(); return; }
  if (!pixelCtx || !pixelImg || !pixelCanvas) return;
  const w = pixelCanvas.width;
  const h = pixelCanvas.height;

  // Calcul de la taille de pixel : level 1 = très gros pixels, level MAX = image nette
  const pixelSize = Math.max(1, Math.round(Math.pow(2, MAX_LEVEL - level)));

  pixelCtx.imageSmoothingEnabled = false;
  // Dessiner en très petit, puis agrandir → effet pixelisé
  const smallW = Math.max(1, Math.ceil(w / pixelSize));
  const smallH = Math.max(1, Math.ceil(h / pixelSize));

  // Tampon off-screen
  const offscreen = document.createElement('canvas');
  offscreen.width  = smallW;
  offscreen.height = smallH;
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(pixelImg, 0, 0, smallW, smallH);

  pixelCtx.imageSmoothingEnabled = false;
  pixelCtx.drawImage(offscreen, 0, 0, smallW, smallH, 0, 0, w, h);
}

function startPixelReveal(onComplete) {
  stopPixelReveal();
  pixelLevel = 1;

  pixelTimer = setInterval(() => {
    pixelLevel++;
    drawPixelated(pixelLevel);
    if (pixelLevel >= MAX_LEVEL) {
      stopPixelReveal();
      if (onComplete) onComplete();
    }
  }, REVEAL_INTERVAL);
}

function stopPixelReveal() {
  if (pixelTimer) { clearInterval(pixelTimer); pixelTimer = null; }
}

function revealFull() {
  stopPixelReveal();
  pixelLevel = MAX_LEVEL;
  drawPixelated(MAX_LEVEL);
}

window.initPixelCanvas  = initPixelCanvas;
window.loadPixelImage   = loadPixelImage;
window.startPixelReveal = startPixelReveal;
window.stopPixelReveal  = stopPixelReveal;
window.revealFull       = revealFull;
