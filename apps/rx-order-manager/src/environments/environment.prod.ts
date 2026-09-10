// Production config: the real Firebase project's web app config (Firebase
// console -> Project settings -> Your apps). These values are not secret —
// a Firebase web API key only identifies the project; access is enforced by
// Firestore security rules (see firestore.rules), not by hiding this config.
//
// PLACEHOLDER: the real rx-order-manager Firebase project doesn't exist yet
// (manual prerequisite — see the implementation plan's Phase B). Fill these
// in once it's created; `fileReplacements` only swaps this file in for
// production builds, so it's inert until then.
export const environment = {
  production: true,
  useEmulators: false,
  ownerEmail: 'qixoticsoftware@gmail.com',
  firebase: {
    apiKey: 'TODO',
    authDomain: 'TODO.firebaseapp.com',
    projectId: 'TODO',
    storageBucket: 'TODO.firebasestorage.app',
    messagingSenderId: 'TODO',
    appId: 'TODO',
  },
};
