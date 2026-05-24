import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initDatabase, loadCollectionFromDb } from './lib/db';
import { getCachedCard, setInMemoryCache } from './lib/card-cache';
import { scoreCard } from './lib/scoring';
import { useCollectionStore } from './stores/collectionStore';
import type { CollectionEntry } from './lib/types';
import './globals.css';

async function bootstrap() {
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

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

bootstrap();
