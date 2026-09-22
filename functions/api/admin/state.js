import { json } from '../../../server/auth.js';
import { github } from '../../../server/repository.js';
export async function onRequestGet({ env, data }) {
  try {
    const state = await github(env).snapshot();
    return json({ groups: state.groups, revision: state.revision, email: data.identity.email });
  } catch (error) { return json({ error: error.status ? error.message : 'GitHub could not be read. Try again.' }, error.status || 502); }
}
