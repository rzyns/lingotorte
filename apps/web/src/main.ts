import './style.css';
import { renderLingotorteShell } from './shell';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = renderLingotorteShell();
