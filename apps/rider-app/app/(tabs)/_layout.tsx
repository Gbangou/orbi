import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { orbiTheme } from '@orbi/ui';
import { usePushRegistration } from '../../lib/use-push-registration';
import { useRiderTabBadge } from '../../lib/use-rider-tab-badge';

type TabIconProps = { color: string; focused: boolean };

// Simple clean SVG-style icons using pure View shapes

function HomeIcon({ color }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.roofBase, { borderBottomColor: color }]} />
      <View style={[icon.wallBase, { borderColor: color }]}>
        <View style={[icon.door, { borderColor: color, backgroundColor: color + '22' }]} />
      </View>
    </View>
  );
}

function ActivityIcon({ color, badge }: TabIconProps & { badge?: number }) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.dotA, { backgroundColor: color }]} />
      <View style={[icon.lineA, { backgroundColor: color }]} />
      <View style={[icon.dotB, { borderColor: color }]} />
      {badge ? (
        <View style={icon.badge}>
          <Text style={icon.badgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TripsIcon({ color }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.tripLine, { backgroundColor: color }]} />
      <View style={[icon.tripLine, { backgroundColor: color, width: 14, opacity: 0.7 }]} />
      <View style={[icon.tripLine, { backgroundColor: color, width: 10, opacity: 0.45 }]} />
    </View>
  );
}

function AccountIcon({ color }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.head, { borderColor: color }]} />
      <View style={[icon.shoulders, { borderColor: color }]} />
    </View>
  );
}

export default function RiderTabsLayout() {
  usePushRegistration();
  const { activityBadge } = useRiderTabBadge();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: orbiTheme.colors.text,
        tabBarInactiveTintColor: '#BBBBBB',
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          tabBarIcon: (p: TabIconProps) => <HomeIcon {...p} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activité',
          tabBarIcon: (p: TabIconProps) => <ActivityIcon {...p} badge={activityBadge} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: 'Trajets',
          tabBarIcon: (p: TabIconProps) => <TripsIcon {...p} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Compte',
          tabBarIcon: (p: TabIconProps) => <AccountIcon {...p} />,
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
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 3,
  },
  item: {
    paddingTop: 2,
  },
});

const icon = StyleSheet.create({
  wrap: {
    width: 26,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roofBase: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: -1,
  },
  wallBase: {
    width: 15,
    height: 9,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  door: {
    width: 5,
    height: 5,
    borderWidth: 1.5,
    borderRadius: 1,
  },
  dotA: {
    width: 7,
    height: 7,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  lineA: {
    width: 1.5,
    height: 6,
    borderRadius: 1,
    alignSelf: 'flex-start',
    marginLeft: 2.5,
    opacity: 0.6,
  },
  dotB: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  tripLine: {
    width: 18,
    height: 2,
    borderRadius: 2,
    alignSelf: 'flex-start',
    marginBottom: 3.5,
  },
  head: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    alignSelf: 'center',
    marginBottom: 2,
  },
  shoulders: {
    width: 18,
    height: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: 'center',
    borderTopColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: orbiTheme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
