import { createRoot } from 'react-dom/client'

// Blueprint.js styles (must come before app styles so overrides take effect)
import '@blueprintjs/core/lib/css/blueprint.css'
import '@blueprintjs/icons/lib/css/blueprint-icons.css'

import './index.css'
import './app.css'

import App from './App'
import { MolTabProvider } from './hooks/useMolTab'
import { CueMolProvider } from './hooks/useCueMol'
import { ThemeProvider } from './contexts/ThemeContext'
import { CommandProvider } from './commands/CommandRegistry'

const container = document.getElementById('root') as HTMLElement
createRoot(container).render(
  <CueMolProvider>
    <MolTabProvider>
      <ThemeProvider>
        <CommandProvider>
          <App />
        </CommandProvider>
      </ThemeProvider>
    </MolTabProvider>
  </CueMolProvider>
)
