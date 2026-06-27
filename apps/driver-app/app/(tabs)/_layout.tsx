import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import { usePushRegistration } from '../../lib/use-push-registration';

type TabIconProps = { color: string; focused: boolean };

function CockpitIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={styles.grid}>
        <View style={[styles.cell, { backgroundColor: color, opacity: focused ? 1 : 0.55 }]} />
        <View style={[styles.cell, { backgroundColor: color, opacity: focused ? 0.65 : 0.35 }]} />
        <View style={[styles.cell, { backgroundColor: color, opacity: focused ? 0.65 : 0.35 }]} />
        <View style={[styles.cell, { backgroundColor: color, opacity: focused ? 1 : 0.55 }]} />
      </View>
    </View>
  );
}

function MissionsIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={[styles.carCabin, { backgroundColor: color, opacity: focused ? 0.75 : 0.45 }]} />
      <View style={[styles.carBody, { backgroundColor: color }]}>
        <View style={[styles.carWindow, { opacity: focused ? 0.5 : 0.3 }]} />
        <View style={[styles.carWindow, { opacity: focused ? 0.5 : 0.3 }]} />
      </View>
      <View style={styles.carWheelRow}>
        <View style={[styles.carWheel, { borderColor: color }]} />
        <View style={[styles.carWheel, { borderColor: color }]} />
      </View>
    </View>
  );
}

function EarningsIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View style={styles.icon}>
      <View style={styles.chartBars}>
        <View style={[styles.bar, { height: 7, backgroundColor: color, opacity: focused ? 0.55 : 0.35 }]} />
        <View style={[styles.bar, { height: 12, backgroundColor: color, opacity: focused ? 0.75 : 0.5 }]} />
        <View style={[styles.bar, { height: 18, backgroundColor: color }]} />
      </View>
      <View style={[styles.chartBase, { backgroundColor: color, opacity: focused ? 0.6 : 0.35 }]} />
    </View>
  );
}

function ProfileIcon({ color, focused }: { color: string; focused: boolean }) {
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
  icon: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    width: 20,
    height: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  cell: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
  carCabin: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignSelf: 'center',
    marginBottom: -1,
  },
  carBody: {
    width: 22,
    height: 10,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  carWindow: {
    width: 5,
    height: 4,
    borderRadius: 2,
    backgroundColor: orbiTheme.colors.background,
  },
  carWheelRow: {
    width: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -2,
  },
  carWheel: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    backgroundColor: orbiTheme.colors.panel,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 18,
  },
  bar: {
    width: 5,
    borderRadius: 2,
  },
  chartBase: {
    width: 22,
    height: 1.5,
    borderRadius: 1,
    marginTop: 1,
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
