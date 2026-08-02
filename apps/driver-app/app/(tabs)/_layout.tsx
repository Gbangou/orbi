import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useMemo } from 'react';
import { type OrbiTheme } from '@orbi/ui';
import { useOrbiTheme } from '@orbi/ui/native';
import { usePushRegistration } from '../../lib/use-push-registration';
import { useDriverOfferAutoOpen } from '../../lib/use-driver-offer-auto-open';

type TabIconProps = { color: string; focused: boolean };

function HomeIcon({ color, focused }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.gaugeArc, { borderColor: color, opacity: focused ? 1 : 0.72 }]} />
      <View style={[icon.gaugeNeedle, { backgroundColor: color }]} />
      <View style={[icon.gaugeDot, { backgroundColor: color }]} />
    </View>
  );
}

function MissionsIcon({ color, focused }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.briefcaseHandle, { borderColor: color, opacity: focused ? 1 : 0.72 }]} />
      <View style={[icon.briefcaseBody, { borderColor: color }]}>
        <View style={[icon.briefcaseLatch, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function EarningsIcon({ color, focused }: TabIconProps) {
  const theme = useOrbiTheme();
  return (
    <View style={icon.wrap}>
      <View style={[icon.walletBody, { borderColor: color }]}>
        <View
          style={[
            icon.walletFlap,
            { borderColor: color, backgroundColor: theme.colors.surface, opacity: focused ? 1 : 0.72 },
          ]}
        />
        <View style={[icon.walletDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ProfileIcon({ color, focused }: TabIconProps) {
  return (
    <View style={icon.wrap}>
      <View style={[icon.profileHead, { borderColor: color, backgroundColor: focused ? `${color}18` : 'transparent' }]} />
      <View style={[icon.profileShoulders, { borderColor: color }]} />
    </View>
  );
}

export default function DriverTabsLayout() {
  usePushRegistration();
  useDriverOfferAutoOpen();
  const theme = useOrbiTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="accueil"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }: TabIconProps) => (
            <HomeIcon color={color} focused={focused} />
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

const makeStyles = (theme: OrbiTheme) =>
  StyleSheet.create({
    tabBar: {
      backgroundColor: '#FFFFFF',
      borderTopColor: '#E8E8E8',
      borderTopWidth: 1,
      height: 78,
      paddingBottom: 14,
      paddingTop: 9,
      elevation: 0,
    },
    tabLabel: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0,
      marginTop: 3,
    },
    tabItem: {
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
  gaugeArc: {
    width: 21,
    height: 17,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 2,
    borderBottomWidth: 0,
  },
  gaugeNeedle: {
    position: 'absolute',
    width: 10,
    height: 2,
    borderRadius: 2,
    bottom: 6,
    transform: [{ rotate: '-28deg' }],
  },
  gaugeDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    bottom: 4,
  },
  briefcaseHandle: {
    width: 10,
    height: 5,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    marginBottom: -1,
  },
  briefcaseBody: {
    width: 21,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
  },
  briefcaseLatch: {
    width: 6,
    height: 2,
    borderRadius: 2,
    marginTop: 5,
  },
  walletBody: {
    width: 22,
    height: 16,
    borderRadius: 5,
    borderWidth: 2,
    justifyContent: 'center',
  },
  walletFlap: {
    position: 'absolute',
    right: -1,
    width: 10,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  walletDot: {
    position: 'absolute',
    right: 5,
    width: 3,
    height: 3,
    borderRadius: 2,
  },
  profileHead: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    alignSelf: 'center',
    marginBottom: 2,
  },
  profileShoulders: {
    width: 18,
    height: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignSelf: 'center',
    borderTopColor: 'transparent',
  },
});
