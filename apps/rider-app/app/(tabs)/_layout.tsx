import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import { usePushRegistration } from '../../lib/use-push-registration';

function HomeIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={[styles.roof, { borderBottomColor: color, opacity: focused ? 1 : 0.55 }]} />
      <View style={[styles.walls, { borderColor: color, backgroundColor: focused ? `${color}20` : 'transparent' }]}>
        <View style={[styles.door, { borderColor: color, opacity: focused ? 0.7 : 0.4 }]} />
      </View>
    </View>
  );
}

function ActivityIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={[styles.routeDot, { backgroundColor: color }]} />
      <View style={[styles.routeLine, { backgroundColor: color, opacity: focused ? 0.7 : 0.4 }]} />
      <View style={[styles.routeDotEnd, { borderColor: color, backgroundColor: focused ? `${color}28` : 'transparent' }]} />
    </View>
  );
}

function TripsIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={[styles.tripLine, { backgroundColor: color, opacity: focused ? 1 : 0.5 }]} />
      <View style={[styles.tripLine, { backgroundColor: color, opacity: focused ? 0.75 : 0.35, width: 14 }]} />
      <View style={[styles.tripLine, { backgroundColor: color, opacity: focused ? 0.5 : 0.25, width: 10 }]} />
    </View>
  );
}

function AccountIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View
        style={[
          styles.head,
          {
            borderColor: color,
            backgroundColor: focused ? `${color}28` : 'transparent',
          },
        ]}
      />
      <View
        style={[
          styles.shoulders,
          {
            borderColor: color,
            borderTopColor: 'transparent',
            backgroundColor: focused ? `${color}18` : 'transparent',
          },
        ]}
      />
    </View>
  );
}

export default function RiderTabsLayout() {
  usePushRegistration();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: orbiTheme.colors.teal,
        tabBarInactiveTintColor: orbiTheme.colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => (
            <HomeIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activité',
          tabBarIcon: ({ color, focused }) => (
            <ActivityIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trajets',
          tabBarIcon: ({ color, focused }) => (
            <TripsIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: ({ color, focused }) => (
            <AccountIcon color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: orbiTheme.colors.panel,
    borderTopColor: orbiTheme.colors.border,
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 14,
    paddingTop: 8,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 2,
  },
  icon: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roof: {
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  walls: {
    width: 16,
    height: 10,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  door: {
    width: 5,
    height: 6,
    borderWidth: 1.5,
    borderRadius: 2,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  routeLine: {
    width: 2,
    height: 7,
    borderRadius: 1,
    alignSelf: 'flex-start',
    marginLeft: 3,
  },
  routeDotEnd: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  tripLine: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    alignSelf: 'flex-start',
    marginBottom: 3,
  },
  head: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    alignSelf: 'center',
    marginBottom: 1,
  },
  shoulders: {
    width: 20,
    height: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: 'center',
  },
});
