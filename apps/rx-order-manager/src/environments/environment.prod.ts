// Production config: the real Firebase project's web app config (Firebase
// console -> Project settings -> Your apps). These values are not secret —
// a Firebase web API key only identifies the project; access is enforced by
// Firestore security rules (see firestore.rules), not by hiding this config.
// `fileReplacements` only swaps this file in for production builds.
export const environment = {
  production: true,
  useEmulators: false,
  ownerEmail: 'qixoticsoftware@gmail.com',
  firebase: {
    apiKey: 'AIzaSyBDrhhwwCUP3Wi8nHvXl6M4sCs-Oz33t3I',
    authDomain: 'med-mgr-qixotic.firebaseapp.com',
    projectId: 'med-mgr-qixotic',
    storageBucket: 'med-mgr-qixotic.firebasestorage.app',
    messagingSenderId: '981639810063',
    appId: '1:981639810063:web:f694647724ec984608a77a',
  },
}
