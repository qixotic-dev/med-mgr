import { readFile } from 'node:fs/promises'

const PLACEHOLDER = 'REPLACE_WITH_FIREBASE_PROJECT_ID'
const TODO = "'TODO'"
const issues = []

const firebaserc = JSON.parse(await readFile('.firebaserc', 'utf8'))
const prodProjectId = firebaserc.projects?.prod
if (!prodProjectId || prodProjectId === PLACEHOLDER) {
  issues.push(
    `Set .firebaserc projects.prod to a real Firebase project ID (not ${PLACEHOLDER}).`,
  )
}

const productionEnv = await readFile(
  'apps/rx-order-manager/src/environments/environment.prod.ts',
  'utf8',
)
if (productionEnv.includes(TODO)) {
  issues.push(
    'Set the Firebase web app values in apps/rx-order-manager/src/environments/environment.prod.ts before production deploys.',
  )
}

if (issues.length > 0) {
  console.error('Production Firebase config is not ready:')
  for (const issue of issues) {
    console.error(`- ${issue}`)
  }
  process.exit(1)
}
