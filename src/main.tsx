import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ScoreProvider } from './context/ScoreContext.tsx'
import { EditorProvider } from './context/EditorContext.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ToastProvider } from './context/ToastContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        <ScoreProvider>
          <EditorProvider>
            <App />
          </EditorProvider>
        </ScoreProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
)
