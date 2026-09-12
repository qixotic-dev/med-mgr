import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core'
import { provideRouter } from '@angular/router'
import { initializeApp, provideFirebaseApp } from '@angular/fire/app'
import { connectAuthEmulator, getAuth, provideAuth } from '@angular/fire/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  provideFirestore,
} from '@angular/fire/firestore'
import {
  connectFunctionsEmulator,
  getFunctions,
  provideFunctions,
} from '@angular/fire/functions'
import { environment } from '../environments/environment'
import { appRoutes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(appRoutes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => {
      const auth = getAuth()
      if (environment.useEmulators) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
          disableWarnings: true,
        })
      }
      return auth
    }),
    provideFirestore(() => {
      const firestore = getFirestore()
      if (environment.useEmulators) {
        connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
      }
      return firestore
    }),
    provideFunctions(() => {
      const functions = getFunctions()
      if (environment.useEmulators) {
        connectFunctionsEmulator(functions, '127.0.0.1', 5001)
      }
      return functions
    }),
  ],
}
