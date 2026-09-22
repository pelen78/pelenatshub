export class HubError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const GROUPS_PATTERN = /\/\*__GROUPS_START__\*\/[\s\S]*?\/\*__GROUPS_END__\*\//;
export function parseGroups(source) {
  const section = source.match(GROUPS_PATTERN)?.[0];
  try {
    const value = JSON.parse(section.match(/const GROUPS =\s*([\s\S]*);\s*\/\*__GROUPS_END__/)[1]);
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(g => Array.isArray(g.activities))) throw new Error();
    return value;
  } catch { throw new HubError('El formato del hub cambió. No se modificó ningún archivo publicado.', 409); }
}

export function writeGroups(source, groups) {
  parseGroups(source);
  const safe = JSON.stringify(groups, null, 2).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return source.replace(GROUPS_PATTERN, () => `/*__GROUPS_START__*/\nconst GROUPS = ${safe};\n/*__GROUPS_END__*/`);
}

export function github(env, fetcher = fetch) {
  const owner = env.GITHUB_OWNER || 'pelen78';
  const repo = env.GITHUB_REPO || 'pelenatshub';
  const branch = env.GITHUB_BRANCH || 'main';
  if (![owner, repo].every(v => /^[\w.-]+$/.test(v))) throw new HubError('Repositorio mal configurado.', 503);
  const root = `https://api.github.com/repos/${owner}/${repo}`;
  async function call(path, method = 'GET', body) {
    const response = await fetcher(root + path, {
      method, headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Pelen-Hub-Publisher', 'X-GitHub-Api-Version': '2022-11-28' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) throw new HubError('Hay cambios nuevos en GitHub. Recarga la lista antes de publicar otra vez.', 409);
      throw new HubError(response.status === 401 || response.status === 403 ? 'GitHub no autorizó la operación. Revisa el permiso Contents: Read and write del token.' : 'No se pudo completar la conexión con GitHub. Intenta nuevamente.', 502);
    }
    return response.json();
  }
  async function snapshot() {
    const ref = await call(`/git/ref/heads/${encodeURIComponent(branch)}`);
    const revision = ref.object.sha;
    const commit = await call(`/git/commits/${revision}`);
    const tree = await call(`/git/trees/${commit.tree.sha}?recursive=1`);
    if (tree.truncated) throw new HubError('El repositorio excede el tamaño compatible con este panel.', 409);
    const index = tree.tree.find(f => f.path === 'index.html' && f.type === 'blob');
    if (!index) throw new HubError('No se encontró index.html en el repositorio.', 409);
    const blob = await call(`/git/blobs/${index.sha}`);
    const source = new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
    return { revision, baseTree: commit.tree.sha, files: tree.tree, source, groups: parseGroups(source) };
  }
  async function commitFiles(state, files, message) {
    const entries = [];
    for (const file of files) {
      const blob = await call('/git/blobs', 'POST', { content: file.content, encoding: file.encoding || 'utf-8' });
      entries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const tree = await call('/git/trees', 'POST', { base_tree: state.baseTree, tree: entries });
    const commit = await call('/git/commits', 'POST', { message, tree: tree.sha, parents: [state.revision] });
    // No force: concurrent edits must never be overwritten.
    await call(`/git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', { sha: commit.sha, force: false });
    return { sha: commit.sha, commitUrl: `https://github.com/${owner}/${repo}/commit/${commit.sha}` };
  }
  return { snapshot, commitFiles, call };
}
