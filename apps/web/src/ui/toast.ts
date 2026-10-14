import type { AppModel, Toast } from '../uiTypes';
import { keyed, peekKeyed } from './keyed.ts';

/**
 * lt-e0j: the single app-wide toast. The live region is one keyed() element, so rerenderApp re-appends the same
 * node instead of creating a fresh role=status region (which screen readers would re-announce every render).
 * Contents change in place only when the toast id changes. Undo is a real <button>, reachable by Tab, never
 * focused automatically.
 */
export const TOAST_DURATION_MS = 5_000;

let nextToastId = 0;
const timers = new WeakMap<AppModel, ReturnType<typeof setTimeout>>();

export function showToast(model: AppModel, text: string, undo?: () => void): Toast {
  const toast: Toast = { id: `toast-${++nextToastId}`, text, ...(undo ? { undo } : {}), expiresAt: model.clock().valueOf() + TOAST_DURATION_MS };
  model.ui.toast = toast;
  scheduleToastExpiry(model);
  return toast;
}

export function dismissToast(model: AppModel): void {
  model.ui.toast = null;
  const timer = timers.get(model);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(model);
  refreshToastRegion(model);
}

/** Same pattern as scheduleLearningWake: wake at the expected time, then trust only model.clock(). */
function scheduleToastExpiry(model: AppModel): void {
  const previous = timers.get(model);
  if (previous !== undefined) clearTimeout(previous);
  timers.delete(model);
  const toast = model.ui.toast;
  if (!toast) return;
  const delay = Math.max(toast.expiresAt - model.clock().valueOf(), 0);
  const timer = setTimeout(() => {
    timers.delete(model);
    if (model.ui.toast?.id !== toast.id) return;
    if (model.clock().valueOf() >= toast.expiresAt) dismissToast(model);
    else scheduleToastExpiry(model);
  }, delay);
  (timer as { unref?: () => void }).unref?.();
  timers.set(model, timer);
}

function fill(model: AppModel, region: HTMLElement): void {
  const toast = model.ui.toast;
  const id = toast?.id ?? '';
  if (region.dataset.toastId === id) return;
  region.dataset.toastId = id;
  region.replaceChildren();
  if (!toast) return;
  const box = document.createElement('div');
  box.className = 'toast';
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = toast.text;
  box.appendChild(text);
  if (toast.undo) {
    const undo = toast.undo;
    box.appendChild(document.createTextNode(' · '));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-undo';
    button.textContent = 'Undo';
    button.addEventListener('click', () => {
      if (model.ui.toast?.id !== toast.id) return;
      undo();
    });
    box.appendChild(button);
  }
  region.appendChild(box);
}

export function renderToastRegion(model: AppModel): HTMLElement {
  return keyed(model, 'toast-region', 'app', () => {
    const region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    fill(model, region);
    return region;
  }, (region) => fill(model, region));
}

/** Update the mounted region without a full rerender (timer expiry). */
function refreshToastRegion(model: AppModel): void {
  const region = peekKeyed<HTMLElement>(model, 'toast-region');
  if (region) fill(model, region);
}
