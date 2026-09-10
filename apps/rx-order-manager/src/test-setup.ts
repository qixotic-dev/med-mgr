import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import { MessageChannel, MessagePort } from 'node:worker_threads';

// undici's fetch implementation needs these Web Streams/encoding/messaging
// globals, which jsdom's sandboxed global does not provide.
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.assign(globalThis, {
    TextEncoder,
    TextDecoder,
    ReadableStream,
    WritableStream,
    TransformStream,
    MessageChannel,
    MessagePort,
  });
}

import { fetch, Headers, Request, Response } from 'undici';

// jsdom implements no Fetch API of its own, so @angular/fire's Firebase SDK
// (which references `fetch` eagerly at import time) throws
// "ReferenceError: fetch is not defined" under the jsdom test environment.
// Node itself provides a native `fetch`, but it lives in the real Node
// realm, not the jsdom-sandboxed one Jest evaluates test code in, so it
// isn't visible here — polyfill with undici's implementation instead.
if (typeof globalThis.fetch === 'undefined') {
  Object.assign(globalThis, { fetch, Headers, Request, Response });
}

setupZonelessTestEnv({
  errorOnUnknownElements: true,
  errorOnUnknownProperties: true,
});
