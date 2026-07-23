import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import MerchantApp from './MerchantApp';
import './styles.css';

const path = window.location.pathname;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {path.startsWith('/admin')
      ? <AdminApp />
      : path.startsWith('/merchant')
        ? <MerchantApp />
        : <App />}
  </StrictMode>,
);
