import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { initDatabase, loadCollectionFromDb } from './lib/db';
import { getCachedCard, setInMemoryCache } from './lib/card-cache';
import { scoreCard } from './lib/scoring';
import { useCollectionStore } from './stores/collectionStore';
import type { CollectionEntry } from './lib/types';
import './globals.css';

async function bootstrap() {
  try {
    await initDatabase();

    if (window.electronAPI?.isElectron) {
      const rows = await loadCollectionFromDb();
      if (rows.length > 0) {
        const collection: CollectionEntry[] = [];
        let skipped = 0;
        for (const row of rows) {
          const cardData = await getCachedCard(row.cardId);
          if (cardData) {
            setInMemoryCache(row.cardId, cardData);
            collection.push({
              csvRow: row.csvRow,
              scryfallData: cardData,
              scores: scoreCard(cardData, row.csvRow, null),
            });
          } else {
            skipped++;
          }
        }
        if (collection.length > 0) {
          useCollectionStore.getState().setCollection(collection);
        }
        if (skipped > 0) {
          console.warn(`EDH Deck Builder: ${skipped} cards from previous collection could not be restored (cache miss). Re-import to restore them.`);
        }
      }
    }
  } catch (err) {
    console.error('Bootstrap failed:', err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="padding:2rem;font-family:system-ui;color:#c44a3a;text-align:center;"><h2>Startup Error</h2><p>${(err as Error).message}</p><p style="color:#9a9080;">Try restarting the app. If this persists, re-import your collection.</p></div>`;
      return;
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  );
}

bootstrap();
