import './index.css';

console.log("Application starting...");

// Global error handler for debugging production crashes - MUST BE AT THE TOP
window.onerror = (message, source, lineno, colno, error) => {
  console.error("Global Error:", message, error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center; background: #fafafa; min-height: 100vh;">
        <h1 style="color: #ef4444; font-size: 24px; font-weight: 900; margin-bottom: 16px;">Application Startup Error</h1>
        <p style="color: #71717a; margin-bottom: 24px;">The application failed to initialize. This is usually due to missing environment variables or a configuration error.</p>
        <div style="margin: 0 auto; max-width: 600px; padding: 20px; background: #18181b; color: #a1a1aa; border-radius: 12px; text-align: left; font-family: monospace; font-size: 12px; overflow: auto; border: 1px solid #27272a;">
          <div style="color: #f4f4f5; margin-bottom: 8px; font-weight: bold;">Error Details:</div>
          ${message}<br/>
          ${source ? `Source: ${source}:${lineno}:${colno}` : ''}
        </div>
        <button onclick="window.location.reload()" style="margin-top: 32px; padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: opacity 0.2s;">
          Retry Loading
        </button>
      </div>
    `;
  }
};

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
