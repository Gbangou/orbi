import { Platform } from 'react-native';
import {
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';

export function preventSensitiveScreenCapture() {
  if (Platform.OS === 'web') return;
  void preventScreenCaptureAsync();
}

export function restoreSensitiveScreenCapture() {
  if (Platform.OS === 'web') return;
  void allowScreenCaptureAsync();
}
