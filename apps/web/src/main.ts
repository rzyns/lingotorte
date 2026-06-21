import './style.css';
import { createAppModel } from './model';
import { rerenderApp } from './app';

document.addEventListener('DOMContentLoaded', () => {
  const model = createAppModel();
  rerenderApp(model);
});
