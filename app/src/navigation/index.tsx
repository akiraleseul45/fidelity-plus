import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { ClientLoginScreen } from '../screens/client/ClientLoginScreen';
import { ClientSignupScreen } from '../screens/client/ClientSignupScreen';
import { ClientSignupSuccessScreen } from '../screens/client/ClientSignupSuccessScreen';
import { ClientRestaurantsScreen } from '../screens/client/ClientRestaurantsScreen';
import { ClientRestaurantDetailScreen } from '../screens/client/ClientRestaurantDetailScreen';
import { ClientQRScreen } from '../screens/client/ClientQRScreen';
import { RestoAuthHomeScreen } from '../screens/resto/RestoAuthHomeScreen';
import { RestoLoginScreen } from '../screens/resto/RestoLoginScreen';
import { RestoSignupScreen } from '../screens/resto/RestoSignupScreen';
import { RestoSignupSuccessScreen } from '../screens/resto/RestoSignupSuccessScreen';
import { RestoScannerScreen } from '../screens/resto/RestoScannerScreen';
import { RestoDashboardScreen } from '../screens/resto/RestoDashboardScreen';
import { RestoSettingsScreen } from '../screens/resto/RestoSettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  ClientLogin: undefined;
  ClientSignup: undefined;
  ClientSignupSuccess: { code: string; pseudonym: string; email?: string };
  ClientRestaurants: undefined;
  ClientRestaurantDetail: { restaurantId: string };
  ClientQR: undefined;
  RestoAuthHome: undefined;
  RestoLogin: undefined;
  RestoSignup: undefined;
  RestoSignupSuccess: { code: string; email: string; emailSent?: boolean; apiError?: string };
  RestoScanner: undefined;
  RestoDashboard: undefined;
  RestoSettings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#fff' },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="ClientLogin"
          component={ClientLoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ClientSignup"
          component={ClientSignupScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ClientSignupSuccess"
          component={ClientSignupSuccessScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ClientQR"
          component={ClientQRScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ClientRestaurants"
          component={ClientRestaurantsScreen}
          options={{ title: 'Partenaires' }}
        />
        <Stack.Screen
          name="ClientRestaurantDetail"
          component={ClientRestaurantDetailScreen}
          options={{ title: '' }}
        />
        <Stack.Screen name="RestoAuthHome" component={RestoAuthHomeScreen} options={{ title: '' }} />
        <Stack.Screen name="RestoLogin" component={RestoLoginScreen} options={{ title: 'Connexion' }} />
        <Stack.Screen name="RestoSignup" component={RestoSignupScreen} options={{ title: 'Inscription' }} />
        <Stack.Screen
          name="RestoSignupSuccess"
          component={RestoSignupSuccessScreen}
          options={{ title: '', headerBackVisible: false }}
        />
        <Stack.Screen
          name="RestoScanner"
          component={RestoScannerScreen}
          options={{ title: 'Scanner' }}
        />
        <Stack.Screen
          name="RestoDashboard"
          component={RestoDashboardScreen}
          options={{ title: 'Tableau de bord' }}
        />
        <Stack.Screen name="RestoSettings" component={RestoSettingsScreen} options={{ title: 'Fidélité' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
