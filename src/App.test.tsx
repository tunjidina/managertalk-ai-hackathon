import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Firebase is forced to "not configured" here so the result does not depend
// on the machine: CRA loads .env and .env.test (not .env.local) under test,
// and either could supply REACT_APP_FIREBASE_* values. The real module is
// kept for everything else; only the config check is replaced.
jest.mock('./lib/firebase', () => ({
  ...jest.requireActual('./lib/firebase'),
  isFirebaseConfigured: () => false,
  missingFirebaseKeys: () => ['REACT_APP_FIREBASE_API_KEY']
}));

// Without config, App must render its setup screen rather than a blank
// page. This guards the lazy-initialisation contract in lib/firebase.ts.
test('renders the app shell and the Firebase setup screen without config', () => {
  render(<App />);
  expect(screen.getAllByText('ManagerTalk').length).toBeGreaterThan(0);
  expect(screen.getByText('Firebase is not configured')).toBeInTheDocument();
  expect(screen.getByText('REACT_APP_FIREBASE_API_KEY')).toBeInTheDocument();
});
