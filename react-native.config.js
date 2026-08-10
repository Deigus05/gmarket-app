// Desativa autolink Android de pacotes iOS-only que declaram módulo Android inexistente.
module.exports = {
  dependencies: {
    'expo-live-activity': {
      platforms: {
        android: null,
      },
    },
  },
};
