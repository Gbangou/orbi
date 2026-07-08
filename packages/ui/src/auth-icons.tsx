import { StyleSheet, View } from 'react-native';

export type OrbiAuthIconName = 'user' | 'mail' | 'lock' | 'eye' | 'eye-off';

export function OrbiAuthIcon({ name, color }: { name: OrbiAuthIconName; color: string }) {
  if (name === 'user') {
    return (
      <View style={authIcon.wrap}>
        <View style={[authIcon.userHead, { borderColor: color }]} />
        <View style={[authIcon.userShoulders, { borderColor: color }]} />
      </View>
    );
  }

  if (name === 'mail') {
    return (
      <View style={[authIcon.mailBox, { borderColor: color }]}>
        <View style={[authIcon.mailFoldLeft, { backgroundColor: color }]} />
        <View style={[authIcon.mailFoldRight, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'lock') {
    return (
      <View style={authIcon.wrap}>
        <View style={[authIcon.lockShackle, { borderColor: color }]} />
        <View style={[authIcon.lockBody, { borderColor: color }]} />
      </View>
    );
  }

  return (
    <View style={authIcon.wrap}>
      <View style={[authIcon.eyeOuter, { borderColor: color }]}>
        <View style={[authIcon.eyePupil, { backgroundColor: color }]} />
      </View>
      {name === 'eye-off' ? (
        <View style={[authIcon.eyeSlash, { backgroundColor: color }]} />
      ) : null}
    </View>
  );
}

const authIcon = StyleSheet.create({
  wrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  userHead: {
    width: 8,
    height: 8,
    borderRadius: 5,
    borderWidth: 1.7,
    marginBottom: 2,
  },
  userShoulders: {
    width: 15,
    height: 7,
    borderRadius: 8,
    borderWidth: 1.7,
    borderTopColor: 'transparent',
  },
  mailBox: {
    width: 20,
    height: 15,
    borderWidth: 1.8,
    borderRadius: 4,
    flexShrink: 0,
    overflow: 'hidden',
  },
  mailFoldLeft: {
    position: 'absolute',
    left: 2,
    top: 6,
    width: 10,
    height: 1.6,
    borderRadius: 1,
    transform: [{ rotate: '32deg' }],
  },
  mailFoldRight: {
    position: 'absolute',
    right: 2,
    top: 6,
    width: 10,
    height: 1.6,
    borderRadius: 1,
    transform: [{ rotate: '-32deg' }],
  },
  lockShackle: {
    width: 11,
    height: 9,
    borderWidth: 1.8,
    borderBottomWidth: 0,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    marginBottom: -2,
  },
  lockBody: {
    width: 17,
    height: 12,
    borderRadius: 4,
    borderWidth: 1.8,
  },
  eyeOuter: {
    width: 20,
    height: 12,
    borderWidth: 1.8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scaleY: 0.82 }],
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  eyeSlash: {
    position: 'absolute',
    width: 23,
    height: 2,
    borderRadius: 2,
    transform: [{ rotate: '-34deg' }],
  },
});
