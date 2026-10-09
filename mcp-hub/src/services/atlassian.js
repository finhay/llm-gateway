// Atlassian (Jira Data Center) service: per-user PAT (credential mode "c").
import { z } from "zod";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]{0,19}-\d{1,9}$/;
const MAX_TEXT = 4000;

export function jiraClient(baseUrl, pat, fetchImpl = fetch) {
  async function call(pathAndQuery) {
    const res = await fetchImpl(`${baseUrl}${pathAndQuery}`, {
      headers: { authorization: `Bearer ${pat}`, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error("Jira rejected the credential");
      err.code = "AUTH";
      throw err;
    }
    if (!res.ok) throw new Error(`Jira error ${res.status}`);
    return res.json();
  }
  return {
    myself: () => call("/rest/api/2/myself"),
    search: (jql, maxResults) => call(`/rest/api/2/search?${new URLSearchParams({
      jql, maxResults: String(maxResults), fields: "summary,status,assignee,priority,updated,issuetype",
    })}`),
    issue: (key) => call(`/rest/api/2/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,reporter,priority,issuetype,created,updated,description,labels`),
  };
}

const clip = (s) => (s && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}… [cắt bớt]` : s || "");

const slimIssue = (i) => ({
  key: i.key,
  summary: i.fields?.summary,
  status: i.fields?.status?.name,
  type: i.fields?.issuetype?.name,
  priority: i.fields?.priority?.name,
  assignee: i.fields?.assignee?.displayName || null,
  updated: i.fields?.updated,
});

export const atlassianService = {
  id: "atlassian",
  title: "Atlassian (Jira Data Center)",
  credentialMode: "user", // per-user PAT stored in the vault
  connectHelp: "Tạo Personal Access Token trong Jira: Avatar → Profile → Personal Access Tokens → Create token.",

  async validateCredential(svcCfg, pat, fetchImpl) {
    const me = await jiraClient(svcCfg.jiraBaseUrl, pat, fetchImpl).myself();
    return { displayName: me.displayName, username: me.name };
  },

  registerTools(server, { svcCfg, getCredential, fetchImpl, run }) {
    const client = async () => jiraClient(svcCfg.jiraBaseUrl, await getCredential(), fetchImpl);

    server.registerTool("jira_search", {
      title: "Tìm issue Jira",
      description: "Search Jira Data Center issues with JQL using the caller's own permissions. Returns key, summary, status, assignee.",
      inputSchema: {
        jql: z.string().min(1).max(1000).describe("JQL, e.g. project = ABC AND status = 'In Progress'"),
        maxResults: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, run("jira_search", async ({ jql, maxResults }) => {
      const r = await (await client()).search(jql, maxResults ?? 20);
      return { total: r.total, issues: (r.issues || []).map(slimIssue) };
    }));

    server.registerTool("jira_get_issue", {
      title: "Xem chi tiết issue Jira",
      description: "Get one Jira issue by key (e.g. ABC-123) with description.",
      inputSchema: { key: z.string().regex(ISSUE_KEY, "Issue key like ABC-123") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, run("jira_get_issue", async ({ key }) => {
      const i = await (await client()).issue(key);
      return {
        ...slimIssue(i),
        reporter: i.fields?.reporter?.displayName || null,
        created: i.fields?.created,
        labels: i.fields?.labels || [],
        description: clip(i.fields?.description),
        url: `${svcCfg.jiraBaseUrl}/browse/${i.key}`,
      };
    }));
  },
};
