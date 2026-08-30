import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ExtensionPopupApp } from './ExtensionPopupApp';
import './styles/app.css';

const extensionPopup = new URLSearchParams(location.search).get('surface') === 'extensions';
if (extensionPopup) document.body.classList.add('extension-popup-page');
createRoot(document.getElementById('root')!).render(<React.StrictMode>{extensionPopup ? <ExtensionPopupApp /> : <App />}</React.StrictMode>);
