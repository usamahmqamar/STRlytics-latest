import './index.css';

// Global error handler for debugging production crashes - MUST BE AT THE TOP
window.onerror = (message, _source, _lineno, _colno, error) => {
  console.error("Global Error:", error || message);
  const root = document.getElementById('root');
  if (!root) return;
  // Built with DOM APIs and textContent so error text can never be executed as HTML.
  const wrap = document.createElement('div');
  wrap.setAttribute('style', 'padding:40px;font-family:sans-serif;text-align:center;background:#fafafa;min-height:100vh;');
  const h1 = document.createElement('h1');
  h1.setAttribute('style', 'color:#b0472f;font-size:24px;font-weight:900;margin-bottom:16px;');
  h1.textContent = 'Application Startup Error';
  const p = document.createElement('p');
  p.setAttribute('style', 'color:#6c766f;margin-bottom:24px;');
  p.textContent = 'The application failed to start. Please reload the page. If this keeps happening, contact support.';
  wrap.append(h1, p);
  if (import.meta.env.DEV) {
    const details = document.createElement('pre');
    details.setAttribute('style', 'margin:0 auto;max-width:600px;padding:20px;background:#1a2420;color:#949d95;border-radius:12px;text-align:left;font-size:12px;overflow:auto;');
    details.textContent = String(message);
    wrap.append(details);
  }
  const btn = document.createElement('button');
  btn.setAttribute('style', 'margin-top:32px;padding:12px 24px;background:#0e5a4a;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:bold;');
  btn.textContent = 'Retry Loading';
  btn.addEventListener('click', () => window.location.reload());
  wrap.append(btn);
  root.replaceChildren(wrap);
};

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Navigate, Route, Routes} from 'react-router-dom';
import App from './App.tsx';
import {AuthProvider} from './auth/AuthProvider';
import {RequireAuth} from './auth/RequireAuth';
import {LoginPage} from './pages/auth/LoginPage';
import {SignupPage} from './pages/auth/SignupPage';
import {ForgotPasswordPage, UpdatePasswordPage} from './pages/auth/PasswordPages';
import {InvitePage} from './pages/auth/InvitePage';
import {RequireWorkspace} from './auth/RequireWorkspace';
import {OnboardingPage} from './pages/onboarding/OnboardingPage';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/update-password" element={<UpdatePasswordPage />} />
          <Route path="/invite/:token" element={<InvitePage />} />
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />
          <Route path="/app/:tab?" element={<RequireAuth><RequireWorkspace><App /></RequireWorkspace></RequireAuth>} />
          <Route path="*" element={<Navigate to="/app/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
