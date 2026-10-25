// First: the deployment's settings are read and checked before the modules that use them run.
import './bootRuntimeConfig';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installPersianValidationMessages } from './utils/persianValidation';

installPersianValidationMessages();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
