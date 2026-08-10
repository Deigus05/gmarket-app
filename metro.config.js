const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const mapsWebStub = path.resolve(__dirname, 'lib/react-native-maps.web.tsx');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      type: 'sourceFile',
      filePath: mapsWebStub,
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
