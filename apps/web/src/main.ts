import './style.css';
import { installBrowserHandleStore } from './browserHandleStore';
import { bootSnapshotCache } from './browserSnapshotCache';
import { createAppModel, restoreMediaAtBoot } from './model';
import { rerenderApp } from './app';
import { bootRememberedPairing } from './rememberedPairing';

document.addEventListener('DOMContentLoaded', () => {
  // Install the IndexedDB handle store before creating the model so the
  // model layer can persist and restore browser File System Access handles.
  // Handle restoration runs at boot after the snapshot cache hydrates
  // (restoreMediaAtBoot) and again after connectLocalService() hydration.
  installBrowserHandleStore();
  const model = createAppModel();
  // lt-0zc: hydrate from the browser snapshot cache (bounded wait, never throws)
  // before the first render; the banner then reports it as unconfirmed.
  // lt-aot: then restore the saved media handle (query-only, bounded 1.5s) so
  // playback returns on reload without pairing the local service.
  void bootSnapshotCache(model)
    .catch(() => false)
    .then(() => restoreMediaAtBoot(model))
    .catch(() => false)
    .finally(() => {
      rerenderApp(model);
      // lt-cfh: an opted-in remembered pairing auto-connects without blocking render.
      void bootRememberedPairing(model, undefined, () => rerenderApp(model))
        .then((connecting) => { if (connecting) rerenderApp(model); /* banner shows connecting */ })
        .catch(() => undefined);
    });
});