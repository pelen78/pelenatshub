import { json } from '../../../../server/auth.js';
import { github } from '../../../../server/repository.js';
import { catalogue } from '../../../../admin/plc/model.js';
export async function onRequestGet({ env, data }) {
  try {
    const state = await github(env).snapshot();
    return json({ courses: catalogue(state.groups, state.revision, env.PUBLIC_ORIGIN || 'https://pelenlab.com'), revision: state.revision, email: data.identity.email });
  } catch (error) { return json({ error: error.status ? error.message : 'The project catalogue could not be loaded. Try again.' }, error.status || 502); }
}
