/**
 * App.js
 * 
 * Application entry point for VibeSpace.
 * Wraps routing in Redux Providers, PersistGate, SafeAreaProvider, and GestureHandlerRootView.
 * Handles custom font loading placeholders and monitors app foreground/background cycles to sync user online status.
 */

import React, { useEffect, useState } from 'react';
import { AppState, StatusBar } from 'react-native';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as Font from 'expo-font';

import { store, persistor } from './src/store';
import RootNavigator from './src/navigation';
import Loader from './src/components/common/Loader';
import { auth, db } from './src/services/firebase';

export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Load custom fonts using expo-font
  useEffect(() => {
    async function loadFonts() {
      try {
        // Load custom fonts or fallback vector icon fonts
        await Font.loadAsync({
          // Add custom font mappings here when assets are ready, e.g.
          // 'Inter-Bold': require('./assets/fonts/Inter-Bold.ttf'),
        });
      } catch (error) {
        console.warn('Error loading custom fonts:', error);
      } finally {
        setFontsLoaded(true);
      }
    }
    loadFonts();
  }, []);

  // Sync user isOnline status in Firebase based on AppState cycles
  useEffect(() => {
    const syncOnlineStatus = async (nextState) => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const userDocRef = doc(db, 'users', currentUser.uid);
      try {
        await updateDoc(userDocRef, {
          isOnline: nextState === 'active',
          lastSeen: serverTimestamp(),
        });
      } catch (error) {
        console.warn('Failed to update online state in firestore:', error);
      }
    };

    // Update status immediately on mount
    syncOnlineStatus(AppState.currentState);

    // Subscribe to state change events
    const subscription = AppState.addEventListener('change', syncOnlineStatus);

    return () => {
      subscription.remove();
    };
  }, []);

  if (!fontsLoaded) {
    return <Loader overlay />;
  }

  return (
    <Provider store={store}>
      <PersistGate loading={<Loader overlay />} persistor={persistor}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar barStyle="light-content" backgroundColor="#1a0533" />
            <RootNavigator />
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </PersistGate>
    </Provider>
  );
}

// NOTE: babel.config.js must contain 'react-native-reanimated/plugin' as the last entry in the plugins array.
