import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dashboard } from './Dashboard.js';
import './sidepanel.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Dashboard />
    </StrictMode>,
  );
}
