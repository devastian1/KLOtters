import { VALIDATION_LIMITS } from '../types';

/**
 * Compresses an uploaded image file to a JPEG Data URL strictly within
 * Firestore security rule and document size limits.
 */
export async function compressImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a JPEG, PNG, or WebP image file.');
  }

  const imageBitmap = await loadImageFromFile(file);
  const maxDimension = 960;
  const scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
  const targetWidth = Math.max(1, Math.round(imageBitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(imageBitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Image canvas is unavailable in this browser.');
  }

  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  const qualities = [0.78, 0.65, 0.52, 0.4];
  for (const quality of qualities) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= VALIDATION_LIMITS.PHOTO_MAX_CHARS - 5000) {
      return dataUrl;
    }
  }

  // Final smaller resize pass if photo is unusually high-detail
  const fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = Math.max(1, Math.round(targetWidth * 0.65));
  fallbackCanvas.height = Math.max(1, Math.round(targetHeight * 0.65));
  const fallbackCtx = fallbackCanvas.getContext('2d');
  if (!fallbackCtx) {
    throw new Error('Failed to resize image.');
  }
  fallbackCtx.drawImage(canvas, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
  const finalDataUrl = fallbackCanvas.toDataURL('image/jpeg', 0.5);

  if (finalDataUrl.length > VALIDATION_LIMITS.PHOTO_MAX_CHARS) {
    throw new Error('Compressed photo is still too large. Please pick a smaller image.');
  }

  return finalDataUrl;
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image file.'));
    };
    img.src = objectUrl;
  });
}
