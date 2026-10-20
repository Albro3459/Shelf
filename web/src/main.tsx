import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { App } from './App';
import './styles.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error('Set VITE_CONVEX_URL by configuring a Convex deployment before starting Vite');
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
