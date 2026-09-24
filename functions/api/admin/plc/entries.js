import { json } from '../../../../server/auth.js';
import { plcStore, readPLCInput } from '../../../../server/plc.js';
const failure = error => json({ error: error.status ? error.message : 'Private storage is unavailable. Your draft was kept; retry in a moment.' }, error.status || 503);
export async function onRequestGet({ env, data }) {
  try { return json({ records: await plcStore(env.PLC_DB).list(data.identity.email.toLowerCase()) }); } catch (error) { return failure(error); }
}
export async function onRequestPut({ request, env, data }) {
  try { return json(await plcStore(env.PLC_DB).save(data.identity.email.toLowerCase(), await readPLCInput(request))); } catch (error) { return failure(error); }
}
