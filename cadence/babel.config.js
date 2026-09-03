module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) already injects the react-native-worklets plugin that
    // Reanimated 4 requires, and injects it last. Do not add it manually — doing so
    // double-applies it and breaks worklet compilation.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
