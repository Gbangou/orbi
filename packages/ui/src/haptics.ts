import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// expo-haptics has no web implementation and throws "not available on web"
// on every call — guard so tap feedback is a native-only enhancement, never
// a crash risk on the web preview target.

export type OrbiImpactStyle = 'light' | 'medium' | 'heavy';
export type OrbiNotificationType = 'success' | 'warning' | 'error';

const impactStyles: Record<OrbiImpactStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

const notificationTypes: Record<OrbiNotificationType, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

export const safeHaptics = {
  impact(style: OrbiImpactStyle = 'light') {
    if (Platform.OS === 'web') return;
    void Haptics.impactAsync(impactStyles[style]);
  },
  notify(type: OrbiNotificationType) {
    if (Platform.OS === 'web') return;
    void Haptics.notificationAsync(notificationTypes[type]);
  },
};
