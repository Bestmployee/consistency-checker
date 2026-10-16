// Equipment photos (Stage 3): shrinks a chosen image on the phone, saves it to an equipment
// item, turns any failure into a plain-English message, and builds the 64×64 thumbnail slot.
// Everything that can fail with the image happens before the single guarded database
// write (ConsistencyDB.setSavedItemPhoto), so a failure never changes the stored photo.

const PHOTO_MAX_FILE_BYTES = 30 * 1024 * 1024; // 31,457,280 bytes
const PHOTO_MAX_SIDE = 640;
const PHOTO_JPEG_QUALITY = 0.8;

const PHOTO_MESSAGES = {
  unusable: "This image couldn't be used. Please choose a different photo.",
  tooLarge: 'This image is too large (over 30 MB). Please choose a smaller photo.',
  storageFull: "There isn't enough storage space on your phone to save this photo.",
};

// Readable reasons for "Couldn't save: [reason]", keyed by ConsistencyDB refusal code.
const PHOTO_SAVE_REASONS = {
  deleted: 'That item was permanently deleted.',
  changed: 'That item changed since the page was opened.',
  missing: 'That item no longer exists.',
};
const PHOTO_UNEXPECTED_REASON = 'Something went wrong. Please try again.';

// An image problem whose message is already the exact text to show.
class PhotoImageError extends Error {}

// Target size for an upright width × height: longest side at most 640px, never enlarged.
function photoTargetSize(width, height) {
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Turns a chosen file into a shrunk JPEG Blob, or throws a PhotoImageError.
async function shrinkPhoto(file) {
  if (file.size > PHOTO_MAX_FILE_BYTES) throw new PhotoImageError(PHOTO_MESSAGES.tooLarge);
  let bitmap;
  try {
    // 'from-image' applies the camera's rotation flag, so portrait photos come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (err) {
    throw new PhotoImageError(PHOTO_MESSAGES.unusable);
  }
  let blob = null;
  try {
    const size = photoTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    // JPEG has no transparency: fill white first so transparent areas don't turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    // Re-encoding keeps only the pixels, so hidden details (location, camera, date) are dropped.
    blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY));
  } catch (err) {
    blob = null;
  } finally {
    bitmap.close();
  }
  if (!blob) throw new PhotoImageError(PHOTO_MESSAGES.unusable);
  return blob;
}

// The message to show for a failed photo add, replace or remove. Never shows raw error text.
function photoErrorMessage(err) {
  if (err instanceof PhotoImageError) return err.message;
  if (err && err.name === 'QuotaExceededError') return PHOTO_MESSAGES.storageFull;
  const reason = (err && PHOTO_SAVE_REASONS[err.code]) || PHOTO_UNEXPECTED_REASON;
  if (!(err && PHOTO_SAVE_REASONS[err.code])) console.error('Photo save failed:', err);
  return `Couldn't save: ${reason}`;
}

// Shrinks the file and saves it as the item's photo (adding or replacing).
// Resolves { ok: true } or { ok: false, message }.
async function savePhotoFromFile(itemId, file) {
  try {
    const blob = await shrinkPhoto(file);
    await ConsistencyDB.setSavedItemPhoto(itemId, blob);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: photoErrorMessage(err) };
  }
}

// Removes the item's photo. Resolves { ok: true } or { ok: false, message }.
async function removePhoto(itemId) {
  try {
    await ConsistencyDB.setSavedItemPhoto(itemId, null);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: photoErrorMessage(err) };
  }
}

// A hidden image chooser. open() lets the phone offer both Camera and Gallery/Files (no
// capture attribute); onFile(file) runs only when a file was actually chosen, so
// cancelling does nothing.
function createPhotoInput(container, onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.className = 'photo-input';
  input.hidden = true;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) onFile(file);
  });
  container.appendChild(input);
  return {
    input,
    open() {
      input.value = ''; // so choosing the same file again still counts as a change
      input.click();
    },
  };
}

// Object URLs for thumbnails: created once per item and released together by reset(),
// called whenever the list that shows them is rebuilt.
function createThumbUrls() {
  let urls = new Map();
  return {
    urlFor(item) {
      if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.photo));
      return urls.get(item.id);
    },
    reset() {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls = new Map();
    },
  };
}

// The 64×64 slot beside an equipment name: the fitted photo, or a neutral empty box.
function makePhotoThumb(item, thumbUrls) {
  if (item.photo instanceof Blob) {
    const img = document.createElement('img');
    img.className = 'photo-thumb';
    img.alt = '';
    img.src = thumbUrls.urlFor(item);
    return img;
  }
  const empty = document.createElement('span');
  empty.className = 'photo-thumb photo-thumb-empty';
  empty.setAttribute('aria-hidden', 'true');
  return empty;
}

window.Photo = {
  MAX_FILE_BYTES: PHOTO_MAX_FILE_BYTES,
  photoTargetSize,
  shrinkPhoto,
  photoErrorMessage,
  savePhotoFromFile,
  removePhoto,
  createPhotoInput,
  createThumbUrls,
  makePhotoThumb,
};
