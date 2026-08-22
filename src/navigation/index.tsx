import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/Home/HomeScreen';
import ImportScreen from '../screens/Deliveries/ImportScreen';
import DeliveriesScreen from '../screens/Deliveries/DeliveriesScreen';
import MapScreen from '../screens/Map/MapScreen';
import SettingsScreen from '../screens/Settings/SettingsScreen';
import { colors } from '../theme';

export type RootStackParamList = {
  Home: undefined;
  Import: undefined;
  Deliveries: undefined;
  Map: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
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
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Import"
          component={ImportScreen}
          options={{ title: 'Importar Planilha' }}
        />
        <Stack.Screen
          name="Deliveries"
          component={DeliveriesScreen}
          options={{ title: 'Entregas', headerShown: false }}
        />
        {/* MapScreen fica 100% tela cheia de borda a borda */}
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
