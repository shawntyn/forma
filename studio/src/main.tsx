import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './CmsApp';
import { createTheme, themeToStyle } from './lib/tokens';
import './index.css';
// The workspace keeps its own default theme. Published pages and the canvas
// override these variables with the shared site theme at their scope boundary.
for (const [name, value] of Object.entries(themeToStyle(createTheme()))) {
  document.documentElement.style.setProperty(name, value);
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
