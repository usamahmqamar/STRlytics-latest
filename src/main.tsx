import './index.css';

console.log("Application starting...");

// Global error handler for debugging production crashes - MUST BE AT THE TOP
window.onerror = (message, _source, _lineno, _colno, error) => {
  console.error("Global Error:", error || message);
  const root = document.getElementById('root');
  if (!root) return;
  // Built with DOM APIs and textContent so error text can never be executed as HTML.
  const wrap = document.createElement('div');
  wrap.setAttribute('style', 'padding:40px;font-family:sans-serif;text-align:center;background:#fafafa;min-height:100vh;');
  const h1 = document.createElement('h1');
  h1.setAttribute('style', 'color:#ef4444;font-size:24px;font-weight:900;margin-bottom:16px;');
  h1.textContent = 'Application Startup Error';
  const p = document.createElement('p');
  p.setAttribute('style', 'color:#71717a;margin-bottom:24px;');
  p.textContent = 'The application failed to start. Please reload the page. If this keeps happening, contact support.';
  wrap.append(h1, p);
  if (import.meta.env.DEV) {
    const details = document.createElement('pre');
    details.setAttribute('style', 'margin:0 auto;max-width:600px;padding:20px;background:#18181b;color:#a1a1aa;border-radius:12px;text-align:left;font-size:12px;overflow:auto;');
    details.textContent = String(message);
    wrap.append(details);
  }
  const btn = document.createElement('button');
  btn.setAttribute('style', 'margin-top:32px;padding:12px 24px;background:#10b981;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;');
  btn.textContent = 'Retry Loading';
  btn.addEventListener('click', () => window.location.reload());
  wrap.append(btn);
  root.replaceChildren(wrap);
};

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
