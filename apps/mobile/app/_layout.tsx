import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../src/theme';

/**
 * App shell: one `QueryClient` for the whole app plus the navigation stack.
 *
 * The client is created inside `useState` rather than at module scope so that
 * fast refresh (and, on web, a remount) does not leave two clients fighting
 * over the same cache.
 */
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Parking data changes as trucks arrive, so treat it as stale
            // quickly, but do not hammer the API on every focus change.
            staleTime: 15_000,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Parking requests' }} />
          <Stack.Screen name="request/[id]" options={{ title: 'Request' }} />
          <Stack.Screen name="assistant" options={{ title: 'Parking assistant' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
