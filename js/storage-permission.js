// Requests persistent storage so Android is less likely to evict this app's
// data under storage pressure. Silent on success; shows a small dismissible
// banner only if unsupported or not (yet) granted.

async function requestPersistentStorage(showBanner) {
  if (!(navigator.storage && navigator.storage.persist)) {
    showBanner("This browser can't protect your data from being cleared automatically. Your data is still saved, just slightly less protected.");
    return;
  }
  const granted = await navigator.storage.persist();
  if (!granted) {
    showBanner("Storage protection wasn't granted yet. It usually turns on automatically once you've installed this app to your home screen and used it a bit.");
  }
}

window.StoragePermission = { requestPersistentStorage };
