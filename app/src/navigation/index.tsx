import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { LegalScreen } from '../screens/LegalScreen';
import { ClientLoginScreen } from '../screens/client/ClientLoginScreen';
import { ClientRecoverScreen } from '../screens/client/ClientRecoverScreen';
import { ClientPartnerDetailScreen } from '../screens/client/ClientPartnerDetailScreen';
import { ClientPartnersScreen } from '../screens/client/ClientPartnersScreen';
import { ClientQRScreen } from '../screens/client/ClientQRScreen';
import { ClientRewardsScreen } from '../screens/client/ClientRewardsScreen';
import { ClientSignupScreen } from '../screens/client/ClientSignupScreen';
import { ClientSignupSuccessScreen } from '../screens/client/ClientSignupSuccessScreen';
import { PartnerAuthHomeScreen } from '../screens/partner/PartnerAuthHomeScreen';
import { PartnerDashboardScreen } from '../screens/partner/PartnerDashboardScreen';
import { PartnerLoginScreen } from '../screens/partner/PartnerLoginScreen';
import { PartnerScannerScreen } from '../screens/partner/PartnerScannerScreen';
import { PartnerSettingsScreen } from '../screens/partner/PartnerSettingsScreen';
import { PartnerSignupScreen } from '../screens/partner/PartnerSignupScreen';
import { PartnerSignupSuccessScreen } from '../screens/partner/PartnerSignupSuccessScreen';

export type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Legal: { doc?: 'mentions' | 'privacy' | 'terms' | 'program' } | undefined;

  // Client
  ClientLogin: undefined;
  ClientRecover: undefined;
  ClientSignup: undefined;
  ClientSignupSuccess: { code: string; pseudonym: string; email?: string };
  ClientQR: undefined;
  ClientPartners: undefined;
  ClientPartnerDetail: { partnerId: string };
  ClientRewards: undefined;

  // Partner
  PartnerAuthHome: undefined;
  PartnerLogin: undefined;
  PartnerSignup: undefined;
  PartnerSignupSuccess: { code: string; email: string; emailSent?: boolean; apiError?: string };
  PartnerScanner: undefined;
  PartnerDashboard: undefined;
  PartnerSettings: undefined;
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
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Mon compte' }} />
        <Stack.Screen name="Legal" component={LegalScreen} options={{ title: 'Informations légales' }} />

        {/* Client */}
        <Stack.Screen name="ClientLogin" component={ClientLoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClientRecover" component={ClientRecoverScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClientSignup" component={ClientSignupScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClientSignupSuccess" component={ClientSignupSuccessScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClientQR" component={ClientQRScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ClientPartners" component={ClientPartnersScreen} options={{ title: 'Partenaires' }} />
        <Stack.Screen name="ClientPartnerDetail" component={ClientPartnerDetailScreen} options={{ title: '' }} />
        <Stack.Screen name="ClientRewards" component={ClientRewardsScreen} options={{ title: 'Mes récompenses' }} />

        {/* Partner */}
        <Stack.Screen name="PartnerAuthHome" component={PartnerAuthHomeScreen} options={{ title: '' }} />
        <Stack.Screen name="PartnerLogin" component={PartnerLoginScreen} options={{ title: 'Connexion' }} />
        <Stack.Screen name="PartnerSignup" component={PartnerSignupScreen} options={{ title: 'Inscription' }} />
        <Stack.Screen name="PartnerSignupSuccess" component={PartnerSignupSuccessScreen} options={{ title: '', headerBackVisible: false }} />
        <Stack.Screen name="PartnerScanner" component={PartnerScannerScreen} options={{ title: 'Scanner' }} />
        <Stack.Screen name="PartnerDashboard" component={PartnerDashboardScreen} options={{ title: 'Tableau de bord' }} />
        <Stack.Screen name="PartnerSettings" component={PartnerSettingsScreen} options={{ title: 'Fidélité' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
