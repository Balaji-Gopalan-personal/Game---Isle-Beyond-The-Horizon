import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AssetsProvider } from './contexts/AssetsContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AssetsProvider>
      <App />
    </AssetsProvider>
  </StrictMode>
);
