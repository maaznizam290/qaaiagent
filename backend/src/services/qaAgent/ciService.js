function buildGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'TestFlux-QA-Agent',
  };
}

async function fetchGitHubRuns({ owner, repo, ref, perPage = 10, token }) {
  const query = new URLSearchParams({
    per_page: String(perPage),
    ...(ref ? { branch: ref } : {}),
  });
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?${query.toString()}`;
  const response = await fetch(url, {
    headers: buildGitHubHeaders(token),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub CI request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const data = await response.json();
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.map((r) => ({
    id: r.id,
    name: r.name,
    branch: r.head_branch,
    status: r.status,
    conclusion: r.conclusion,
    htmlUrl: r.html_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function fetchGitLabPipelines({ owner, repo, ref, perPage = 10, token }) {
  const projectPath = encodeURIComponent(`${owner}/${repo}`);
  const query = new URLSearchParams({
    per_page: String(perPage),
    ...(ref ? { ref } : {}),
  });
  const url = `https://gitlab.com/api/v4/projects/${projectPath}/pipelines?${query.toString()}`;
  const response = await fetch(url, {
    headers: {
      ...(token ? { 'PRIVATE-TOKEN': token } : {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitLab CI request failed (${response.status}): ${body.slice(0, 200)}`);
  }
  const pipelines = await response.json();
  return (Array.isArray(pipelines) ? pipelines : []).map((p) => ({
    id: p.id,
    name: p.name || 'pipeline',
    branch: p.ref,
    status: p.status,
    conclusion: p.status,
    htmlUrl: p.web_url,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));
}

async function fetchCiStatus({ provider, owner, repo, ref, perPage }) {
  const token =
    provider === 'github'
      ? process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
      : process.env.GITLAB_TOKEN || '';

  const runs = provider === 'github'
    ? await fetchGitHubRuns({ owner, repo, ref, perPage, token })
    : await fetchGitLabPipelines({ owner, repo, ref, perPage, token });

  const latest = runs[0] || null;
  const health = latest && ['success', 'completed'].includes(String(latest.conclusion || '').toLowerCase())
    ? 'healthy'
    : latest
      ? 'attention'
      : 'unknown';

  return {
    provider,
    repo: `${owner}/${repo}`,
    ref: ref || null,
    health,
    latest,
    runs,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  fetchCiStatus,
};

