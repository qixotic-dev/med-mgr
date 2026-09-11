// GitHub Pages serves a static 404.html for any unknown path. Since this is
// an Angular SPA with client-side routing, a direct deep-link or a page
// refresh on such a path would otherwise 404 instead of letting the Angular
// router handle it. Copying index.html to 404.html is the standard
// workaround: GitHub Pages serves it for the unmatched path, the browser
// loads the Angular app, and the router takes over from there.
import { copyFile } from 'node:fs/promises'

const DIST_DIR = 'dist/apps/rx-order-manager/browser'

await copyFile(`${DIST_DIR}/index.html`, `${DIST_DIR}/404.html`)
console.log(`Copied ${DIST_DIR}/index.html -> ${DIST_DIR}/404.html`)
