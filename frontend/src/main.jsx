import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import App from './App.jsx';
import { InfoProvider } from './lib.jsx';
import { ToastProvider } from './ui.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <InfoProvider>
          <App />
        </InfoProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
