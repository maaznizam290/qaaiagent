function buildGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'User-Agent': 'TestFlux-QA-Agent',
  };
}

function parseGitHubRepoInput(owner, repo) {
  const ownerRaw = String(owner || '').trim();
  const repoRaw = String(repo || '').trim();
  const ownerClean = ownerRaw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .trim();
  const repoClean = repoRaw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/^github\.com\//i, '')
    .trim();

  // Support users pasting full repo URL into either field.
  const combined = `${ownerRaw} ${repoRaw}`;
  const urlMatch = combined.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)(?:[/?#]|$)/i);
  if (urlMatch) {
    return {
      owner: urlMatch[1].trim(),
      repo: urlMatch[2].replace(/\.git$/i, '').trim(),
    };
  }

  // Support "owner/repo" entered in owner or repo field.
  const ownerPath = ownerClean.split('/').filter(Boolean);
  if (ownerPath.length >= 2) {
    return {
      owner: ownerPath[ownerPath.length - 2].trim(),
      repo: ownerPath[ownerPath.length - 1].replace(/\.git$/i, '').trim(),
    };
  }
  const repoPath = repoClean.split('/').filter(Boolean);
  if (repoPath.length === 1 && ownerPath.length === 1) {
    return {
      owner: ownerPath[0].trim(),
      repo: repoPath[0].replace(/\.git$/i, '').trim(),
    };
  }
  if (repoPath.length >= 2) {
    return {
      owner: repoPath[repoPath.length - 2].trim(),
      repo: repoPath[repoPath.length - 1].replace(/\.git$/i, '').trim(),
    };
  }

  return {
    owner: ownerPath[0] || ownerClean,
    repo: repoPath[0] ? repoPath[0].replace(/\.git$/i, '') : repoClean.replace(/\.git$/i, ''),
  };
}

async function fetchGitHubRuns({ owner, repo, ref, perPage = 10, token }) {
  const parsedRepo = parseGitHubRepoInput(owner, repo);
  const query = new URLSearchParams({
    per_page: String(perPage),
    ...(ref ? { branch: ref } : {}),
  });
  const url = `https://api.github.com/repos/${encodeURIComponent(parsedRepo.owner)}/${encodeURIComponent(parsedRepo.repo)}/actions/runs?${query.toString()}`;
  const response = await fetch(url, {
    headers: buildGitHubHeaders(token),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 404) {
      const repoRef = `${parsedRepo.owner}/${parsedRepo.repo}`;
      const guidance = token
        ? `Repository "${repoRef}" was not found or token lacks access (needs repo/actions read permissions).`
        : `Repository "${repoRef}" was not found publicly. If it is private, set GITHUB_TOKEN with repo/actions read permissions.`;
      throw new Error(`GitHub CI request failed (404): ${guidance}`);
    }
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

  const parsedRepo = provider === 'github'
    ? parseGitHubRepoInput(owner, repo)
    : { owner, repo };

  const runs = provider === 'github'
    ? await fetchGitHubRuns({ owner: parsedRepo.owner, repo: parsedRepo.repo, ref, perPage, token })
    : await fetchGitLabPipelines({ owner: parsedRepo.owner, repo: parsedRepo.repo, ref, perPage, token });

  const latest = runs[0] || null;
  const health = latest && ['success', 'completed'].includes(String(latest.conclusion || '').toLowerCase())
    ? 'healthy'
    : latest
      ? 'attention'
      : 'unknown';

  return {
    provider,
    repo: `${parsedRepo.owner}/${parsedRepo.repo}`,
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
