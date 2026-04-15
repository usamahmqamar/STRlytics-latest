import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handler for debugging production crashes
if (import.meta.env.PROD) {
  window.onerror = (message) => {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="padding: 40px; font-family: sans-serif; text-align: center;">
          <h1 style="color: #ef4444;">Application Error</h1>
          <p style="color: #71717a;">Something went wrong while loading the app.</p>
          <div style="margin-top: 20px; padding: 20px; background: #f4f4f5; border-radius: 8px; text-align: left; font-family: monospace; font-size: 12px; overflow: auto;">
            ${message}
          </div>
          <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #18181b; color: white; border: none; border-radius: 6px; cursor: pointer;">
            Reload Application
          </button>
        </div>
      `;
    }
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
