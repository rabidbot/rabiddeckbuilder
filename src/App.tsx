import { Routes, Route } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import WelcomeView from './components/layout/WelcomeView';
import ImportView from './components/collection/ImportView';
import CollectionView from './components/collection/CollectionView';
import DeckBuilderView from './components/deck/DeckBuilderView';
import StatsView from './components/stats/StatsView';
import DamageTrackerView from './components/tracker/DamageTrackerView';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<WelcomeView />} />
        <Route path="/import" element={<ImportView />} />
        <Route path="/collection" element={<CollectionView />} />
        <Route path="/builder" element={<DeckBuilderView />} />
        <Route path="/stats/:deckId?" element={<StatsView />} />
        <Route path="/tracker" element={<DamageTrackerView />} />
      </Route>
    </Routes>
  );
}
