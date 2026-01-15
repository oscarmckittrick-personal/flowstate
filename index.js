if (__DEV__) {
  try {
    // Avoid dev-only keep-awake crashes on Android (CurrentActivityNotFoundException).
    const { Platform } = require('react-native');
    if (Platform.OS === 'android') {
      const keepAwake = require('expo-keep-awake');
      keepAwake.useKeepAwake = () => {};
      keepAwake.activateKeepAwakeAsync = async () => {};
      keepAwake.activateKeepAwake = async () => {};
      keepAwake.deactivateKeepAwake = async () => {};
    }
  } catch {}
}

import 'expo-router/entry';
