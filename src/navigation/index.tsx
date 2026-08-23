import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import MapScreen from '../screens/Map/MapScreen';
import ImportScreen from '../screens/Deliveries/ImportScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import HomeScreen from '../screens/Home/HomeScreen';
import DeliveriesScreen from '../screens/Deliveries/DeliveriesScreen';
import DiagnosticScreen from '../screens/Deliveries/DiagnosticScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Map: undefined;
  Import: undefined;
  Settings: undefined;
  Home: undefined;
  Deliveries: undefined;
  Diagnostic: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Map"
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.primary,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 17,
            color: colors.text,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Import"
          component={ImportScreen}
          options={{ title: 'Importar Planilha' }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Deliveries"
          component={DeliveriesScreen}
          options={{ title: 'Entregas', headerShown: false }}
        />
        <Stack.Screen
          name="Diagnostic"
          component={DiagnosticScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
