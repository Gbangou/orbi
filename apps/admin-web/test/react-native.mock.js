module.exports = {
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => undefined }),
  },
  Platform: {
    OS: 'web',
    select: (values) => values?.web ?? values?.default,
  },
};
