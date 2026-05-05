import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { FirebaseProvider } from './components/FirebaseProvider';
import { Layout } from './components/Layout';

// Lazy load routes
const Reception = lazy(() => import('./components/Reception').then(m => ({ default: m.Reception })));
const Home = lazy(() => import('./components/Home').then(m => ({ default: m.Home })));
const Quiz = lazy(() => import('./components/Quiz').then(m => ({ default: m.Quiz })));
const Leaderboard = lazy(() => import('./components/Leaderboard').then(m => ({ default: m.Leaderboard })));
const Profile = lazy(() => import('./components/Profile').then(m => ({ default: m.Profile })));
const Settings = lazy(() => import('./components/Settings').then(m => ({ default: m.Settings })));
const Battle = lazy(() => import('./components/Battle').then(m => ({ default: m.Battle })));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-12 h-12 border-4 border-arkumen-gold border-t-transparent rounded-full animate-spin"></div>
  </div>
);

export default function App() {
  return (
    <Router>
      <FirebaseProvider>
        <Layout>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Reception />} />
              <Route path="/arena" element={<Home />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/battle" element={<Battle />} />
              <Route path="*" element={<Reception />} />
            </Routes>
          </Suspense>
        </Layout>
      </FirebaseProvider>
    </Router>
  );
}
