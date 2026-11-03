// UniSpace Cloudflare Pages Function adapter.
// The existing API implementation remains in the root worker.js file.
import apiWorker from '../../worker.js';

export async function onRequest({ request, env }) {
  return apiWorker.fetch(request, env);
}
