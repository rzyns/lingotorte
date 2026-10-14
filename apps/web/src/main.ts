import './style.css';
import { installBrowserHandleStore } from './browserHandleStore';
import { bootSnapshotCache } from './browserSnapshotCache';
import { createAppModel } from './model';
import { rerenderApp } from './app';

document.addEventListener('DOMContentLoaded', () => {
  // Install the IndexedDB handle store before creating the model so the
  // model layer can persist and restore browser File System Access handles.
  // Handle restoration happens after local-service state hydration via
  // connectLocalService(); on a cold reload without a connected service the
  // relink affordance appears once the user reconnects and hydrates state.
  installBrowserHandleStore();
  const model = createAppModel();
  // lt-0zc: hydrate from the browser snapshot cache (bounded wait, never throws)
  // before the first render; the banner then reports it as unconfirmed.
  void bootSnapshotCache(model).finally(() => rerenderApp(model));
});