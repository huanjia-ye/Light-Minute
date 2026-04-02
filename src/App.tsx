import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AppProviders } from './app/providers';
import { AppRouter } from './app/router';
import { getRouterMode } from './app/routerMode';

function App() {
  const Router = getRouterMode(window.location.protocol) === 'hash' ? HashRouter : BrowserRouter;

  return (
    <AppProviders>
      <Router>
        <AppRouter />
      </Router>
    </AppProviders>
  );
}

export default App;
