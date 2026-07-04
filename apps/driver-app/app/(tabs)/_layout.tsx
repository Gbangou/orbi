import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import { usePushRegistration } from '../../lib/use-push-registration';

type TabIconProps = { color: string; focused: boolean };

function CockpitIcon({ color, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'speedometer' : 'speedometer-outline'}
      size={24}
      color={color}
    />
  );
}

function MissionsIcon({ color, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'briefcase' : 'briefcase-outline'}
      size={23}
      color={color}
    />
  );
}

function EarningsIcon({ color, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'wallet' : 'wallet-outline'}
      size={23}
      color={color}
    />
  );
}

function ProfileIcon({ color, focused }: TabIconProps) {
  return (
    <Ionicons
      name={focused ? 'person-circle' : 'person-circle-outline'}
      size={25}
      color={color}
    />
  );
}

export default function DriverTabsLayout() {
  usePushRegistration();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: orbiTheme.colors.text,
        tabBarInactiveTintColor: '#BBBBBB',
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="accueil"
        options={{
          title: 'Cockpit',
          tabBarIcon: ({ color, focused }: TabIconProps) => (
            <CockpitIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="offres"
        options={{
          title: 'Missions',
          tabBarIcon: ({ color, focused }: TabIconProps) => (
            <MissionsIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="revenus"
        options={{
          title: 'Revenus',
          tabBarIcon: ({ color, focused }: TabIconProps) => (
            <EarningsIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, focused }: TabIconProps) => (
            <ProfileIcon color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#F0F0F0',
    borderTopWidth: 1,
    height: 82,
    paddingBottom: 16,
    paddingTop: 10,
    elevation: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  tabItem: {
    paddingTop: 2,
  },
});
