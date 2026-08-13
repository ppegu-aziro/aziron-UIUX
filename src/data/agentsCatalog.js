/** Seed catalog for the Agents UI (list, edit flow). */

export const AGENTS_STORAGE_KEY = "aziron_agents_v1";

// INITIAL_AGENTS must be declared before the storage helpers so migration can reference it.

export const INITIAL_AGENTS = [
  { id: 0,  name: "Customer Appreciation",   description: "Create branded appreciation cards, submit for team approval, and send to recipients—from one chat.",                        date: "23 Mar 2025", provider: "OpenAI",    model: "GPT-4.5",        status: "active",   lastRun: "2 min ago",   success: 98,  accessEnabled: true,  visibility: "public",  labels: ["l-2", "l-6"] },
  { id: 1,  name: "CV Agent",                description: "Streamlines resume creation with smart suggestions and formatting to help you stand out in any application.",                date: "23 Mar 2025", provider: "OpenAI",    model: "GPT-4.5",        status: "active",   lastRun: "1h ago",      success: 94,  accessEnabled: true,  visibility: "public",  knowledgeHubs: [1], ragMode: true, vectorSearch: true, vaultLabels: [{ label: "OpenAI API Key", key: "OPENAI_API_KEY", marketplacePublished: true }, { label: "ATS webhook secret", key: "ATS_WEBHOOK_SECRET", marketplacePublished: false }], labels: ["l-1"] },
  { id: 2,  name: "Portfolio Builder",       description: "Creates and curates a personalized portfolio showcasing your best work and achievements effectively.",                        date: "15 Apr 2025", provider: "Anthropic", model: "Claude 3.5",     status: "idle",     lastRun: "3h ago",      success: 87,  accessEnabled: false, visibility: "private", labels: ["l-1"] },
  { id: 3,  name: "Job Matcher",             description: "",                                                                                                                         date: "10 May 2025", provider: "OpenAI",    model: "GPT-4o",         status: "idle",     lastRun: "Yesterday",   success: 91,  accessEnabled: false, visibility: "private", labels: ["l-1"] },
  { id: 4,  name: "Interview Coach",         description: "Prepares you for interviews with practice questions, feedback, and real-time personalized coaching.",                        date: "01 Jun 2025", provider: "Anthropic", model: "Claude 3.5",     status: "active",   lastRun: "30 min ago",  success: 96,  accessEnabled: true,  visibility: "public",  labels: ["l-1", "l-2"] },
  { id: 5,  name: "Skill Tracker",           description: "Monitors your skill development progress and recommends tailored learning paths for continuous growth.",                     date: "20 Jun 2025", provider: "OpenAI",    model: "GPT-4.5",        status: "error",    lastRun: "2h ago",      success: 62,  accessEnabled: false, visibility: "private", labels: ["l-5"] },
  { id: 6,  name: "Networking Assistant",    description: "Helps you build and maintain professional connections on LinkedIn and other major platforms.",                               date: "30 Jul 2025", provider: "Anthropic", model: "Claude 3 Haiku", status: "idle",     lastRun: "2 days ago",  success: 89,  accessEnabled: false, visibility: "private", labels: ["l-6"] },
  { id: 7,  name: "Salary Insights",         description: "Provides data-driven salary benchmarks and effective negotiation strategies for your specific role.",                        date: "12 Aug 2025", provider: "OpenAI",    model: "GPT-4o",         status: "active",   lastRun: "15 min ago",  success: 100, accessEnabled: true,  visibility: "public",  labels: ["l-1", "l-3"] },
  { id: 8,  name: "Freelance Finder",        description: "Discovers freelance opportunities that precisely match your expertise and hourly rate expectations.",                        date: "25 Sep 2025", provider: "OpenAI",    model: "GPT-4.5",        status: "idle",     lastRun: "5h ago",      success: 83,  accessEnabled: false, visibility: "private", labels: [] },
  { id: 9,  name: "Profile Enhancer",        description: "Optimizes your professional profiles on major job platforms to maximize your visibility to recruiters.",                     date: "05 Oct 2025", provider: "Anthropic", model: "Claude 3.5",     status: "disabled", lastRun: "1 week ago",  success: 78,  accessEnabled: false, visibility: "private", labels: ["l-6"] },
  { id: 10, name: "Job Application Tracker", description: "Keeps track of all your job applications, deadlines, follow-up actions, and application statuses.",                         date: "15 Nov 2025", provider: "OpenAI",    model: "GPT-4o mini",    status: "active",   lastRun: "5 min ago",   success: 99,  accessEnabled: false, visibility: "private", labels: ["l-1", "l-4"] },
  { id: 11, name: "Resume Analyzer",         description: "Analyzes your resume and provides specific, actionable feedback to significantly improve your success rates.",               date: "03 Dec 2025", provider: "Anthropic", model: "Claude 3.5",     status: "active",   lastRun: "45 min ago",  success: 93,  accessEnabled: true,  visibility: "public",  knowledgeHubs: [1], ragMode: true, vectorSearch: false, labels: ["l-1"] },
  { id: 12, name: "Cover Letter Generator",  description: "",                                                                                                                         date: "20 Jan 2026", provider: "OpenAI",    model: "GPT-4.5",        status: "idle",     lastRun: "Yesterday",   success: 90,  accessEnabled: false, visibility: "private", labels: ["l-1"] },
  { id: 13, name: "Skill Assessment",        description: "Evaluates your technical and soft skills through engaging interactive assessments and practical quizzes.",                   date: "28 Feb 2026", provider: "OpenAI",    model: "GPT-4o",         status: "error",    lastRun: "3h ago",      success: 55,  accessEnabled: false, visibility: "private", labels: ["l-5"] },
  { id: 14, name: "Personal Branding",       description: "Helps you craft a strong and consistent personal brand narrative across all professional channels.",                         date: "15 Mar 2026", provider: "Anthropic", model: "Claude 3 Haiku", status: "idle",     lastRun: "4 days ago",  success: 85,  accessEnabled: false, visibility: "private", labels: ["l-6"] },
  { id: 15, name: "Career Path Explorer",    description: "Maps out potential career trajectories based on your unique goals and current market demand trends.",                        date: "12 Apr 2026", provider: "OpenAI",    model: "GPT-4.5",        status: "active",   lastRun: "1h ago",      success: 97,  accessEnabled: true,  visibility: "public",  knowledgeHubs: [1, 2], vaultLabels: [{ label: "OpenAI API Key", key: "OPENAI_API_KEY", marketplacePublished: true }, { label: "Labor market API token", key: "LABOR_MARKET_API_TOKEN", marketplacePublished: false }, { label: "Notify webhook URL", key: "NOTIFY_WEBHOOK_URL", marketplacePublished: false }], labels: ["l-4"] },
  { id: 16, name: "Mentorship Match",        description: "Connects you with experienced mentors in your industry for personalized guidance and ongoing support.",                      date: "29 Apr 2026", provider: "Anthropic", model: "Claude 3.5",     status: "disabled", lastRun: "2 weeks ago", success: 72,  accessEnabled: false, visibility: "private", labels: ["l-2"] },
  { id: 17, name: "Industry News Alerts",    description: " ",                                                                                                                        date: "10 May 2026", provider: "OpenAI",    model: "GPT-4o mini",    status: "active",   lastRun: "10 min ago",  success: 100, accessEnabled: false, visibility: "private", labels: ["l-4"] },
  { id: 18, name: "Work-Life Balance Tracker", description: "Monitors your work patterns and suggests practical strategies for achieving a healthier balance.",                        date: "25 Jun 2026", provider: "Anthropic", model: "Claude 3 Haiku", status: "idle",     lastRun: "1 week ago",  success: 81,  accessEnabled: false, visibility: "private", labels: [] },
  { id: 19, name: "Continuous Learning Hub", description: "Recommends and tracks online courses and certifications to support your ongoing professional development.",                  date: "15 Jul 2026", provider: "OpenAI",    model: "GPT-4o",         status: "idle",     lastRun: "3 days ago",  success: 88,  accessEnabled: false, visibility: "private", labels: ["l-5"] },
  { id: 20, name: "Brand Voice Assistant",   description: "Answers questions using Files Hub brand guidelines, tone rules, and approved messaging.",                              date: "02 May 2026", provider: "Anthropic", model: "Claude 3.5",     status: "active",   lastRun: "20 min ago",  success: 95,  accessEnabled: true,  visibility: "private", knowledgeHubs: [1], ragMode: true, vectorSearch: true, labels: ["l-6"] },
  { id: 21, name: "Campaign Content Copilot", description: "Drafts social posts, landing copy, and email snippets grounded in Files Hub campaign assets.",                        date: "18 May 2026", provider: "OpenAI",    model: "GPT-4.5",        status: "active",   lastRun: "1h ago",      success: 92,  accessEnabled: true,  visibility: "private", knowledgeHubs: [1], ragMode: true, vectorSearch: false, labels: ["l-6"] },
  { id: 22, name: "Digital Asset Finder",    description: "Semantic search across Files Hub documents, creatives, and briefs for fast retrieval.",                               date: "26 May 2026", provider: "OpenAI",    model: "GPT-4o",         status: "active",   lastRun: "10 min ago",  success: 98,  accessEnabled: true,  visibility: "private", knowledgeHubs: [1], ragMode: true, vectorSearch: true, labels: ["l-4"] },
  { id: 23, name: "SEO Content Optimizer",   description: "Audits Files Hub pages and docs for SEO gaps and suggests keyword-aligned rewrites.",                                 date: "04 Jun 2026", provider: "OpenAI",    model: "GPT-4.5",        status: "active",   lastRun: "25 min ago",  success: 91,  accessEnabled: true,  visibility: "private", knowledgeHubs: [1], ragMode: true, vectorSearch: false, labels: ["l-4"] },
  { id: 24, name: "Social Calendar Planner", description: "Plans weekly social content using Files Hub campaign calendars and approved asset library.",                          date: "11 Jun 2026", provider: "Anthropic", model: "Claude 3.5",     status: "idle",     lastRun: "3h ago",      success: 89,  accessEnabled: true,  visibility: "private", knowledgeHubs: [1], ragMode: true, vectorSearch: false, labels: ["l-6"] },
];

/** Remap legacy seed hub ids (pre–3-hub model) to Files (1), Database (2), API (3). */
const LEGACY_HUB_ID_MAP = {
  2: 1,
  3: 1,
  4: 2,
  5: 1,
  6: 1,
  7: 1,
  8: 1,
  9: 1,
};

function migrateKnowledgeHubIds(hubIds) {
  if (!Array.isArray(hubIds)) return hubIds;
  const migrated = [
    ...new Set(
      hubIds
        .map((id) => LEGACY_HUB_ID_MAP[id] ?? id)
        .filter((id) => Number(id) >= 1 && Number(id) <= 3),
    ),
  ];
  return migrated;
}

/**
 * Migrate a stored agent: backfill any fields added after the initial release.
 * Stored user edits win; seed data provides defaults for new fields like `labels`.
 */
function migrateStoredAgent(stored) {
  const seed = INITIAL_AGENTS.find(s => s.id === stored.id);
  const publishScope =
    stored.publishScope ??
    (stored.visibility === "public" ? "org" : "private");
  const knowledgeHubs = migrateKnowledgeHubIds(stored.knowledgeHubs ?? seed?.knowledgeHubs);
  return {
    ...stored,                    // stored values always win
    // After the spread, because a stored agent from before labels existed
    // carries the key with `undefined`, and a spread of that would overwrite
    // a default set ahead of it.
    labels: stored.labels ?? seed?.labels ?? [],
    knowledgeHubs,
    publishScope,
    visibility: publishScope === "private" ? "private" : "public",
  };
}

export function loadAgentsFromStorage() {
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const stored = parsed.map(migrateStoredAgent);
    const storedIds = new Set(stored.map((a) => a.id));
    const missing = INITIAL_AGENTS.filter((a) => !storedIds.has(a.id)).map((a) => migrateStoredAgent(a));
    return missing.length ? [...stored, ...missing] : stored;
  } catch {
    return null;
  }
}

export function saveAgentsToStorage(agents) {
  try {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
  } catch {
    /* ignore */
  }
}
