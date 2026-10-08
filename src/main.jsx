import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProvider } from './state/AppContext.jsx'
import App from './App.jsx'
import { startPwa } from './pwa.js'
import { UpdateBar } from './components/Pwa.jsx'
import './styles.css'

startPwa()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProvider>
        <App />
        <UpdateBar />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
