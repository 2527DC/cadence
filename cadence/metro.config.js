const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// The Tailwind entry lives in src/ because the template already ships one there for the
// web font variables. One CSS entry, not two.
module.exports = withNativeWind(config, { input: './src/global.css' });
