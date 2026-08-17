import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import HomeScreen from '../screens/Home/HomeScreen';
import ImportScreen from '../screens/Deliveries/ImportScreen';
import DeliveriesScreen from '../screens/Deliveries/DeliveriesScreen';
import MapScreen from '../screens/Map/MapScreen';

export type RootStackParamList = {
  Home: undefined;
  Import: undefined;
  Deliveries: undefined;
  Map: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: { backgroundColor: '#2563eb' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'RotaSimples' }}
        />
        <Stack.Screen
          name="Import"
          component={ImportScreen}
          options={{ title: 'Importar Planilha' }}
        />
        <Stack.Screen
          name="Deliveries"
          component={DeliveriesScreen}
          options={{ title: 'Lista de Entregas' }}
        />
        <Stack.Screen
          name="Map"
          component={MapScreen}
          options={{ title: 'Navegação e Rota' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
