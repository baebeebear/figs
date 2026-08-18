import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App.tsx'
import { checkConnection } from './services/supabase.ts'
import './styles/app.css'

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('is-native')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void checkConnection()
