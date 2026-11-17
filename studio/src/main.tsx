import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './CmsApp';
import { createTheme } from './lib/tokens';
import './index.css';
import { applyRootTheme } from './lib/runtime-styles';
// The workspace keeps its own default theme. Published pages and the canvas
// override these variables with the shared site theme at their scope boundary.
applyRootTheme(createTheme());
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
