// Development config: points at the Firebase Local Emulator Suite so local
// dev/tests never touch the real project or incur cost. Start both with
// `pnpm run dev`.
export const environment = {
  production: false,
  useEmulators: true,
  ownerEmail: 'qixoticsoftware@gmail.com',
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-rx-order-manager.firebaseapp.com',
    projectId: 'demo-rx-order-manager',
    storageBucket: 'demo-rx-order-manager.appspot.com',
    messagingSenderId: '0',
    appId: '1:0:web:0',
  },
};
