"use strict";
(() => {
  // src/shared/constants.ts
  var STORAGE_KEY = "applypilot_state_v1";
  var emptyProfile = () => ({
    firstName: "Ismail",
    lastName: "Bouchnafa",
    email: "ibouchnafa17@gmail.com",
    phone: "+212 628 737 968",
    city: "Kenitra, Morocco",
    linkedinUrl: "",
    portfolioUrl: "",
    currentTitle: "Low-Voltage / ELV Technician - CCTV & Network Cabling",
    yearsExperience: "",
    skills: ["Monter instalacji niskoprądowych", "ELV", "CCTV", "Video surveillance", "NVR", "Access control", "Intrusion and alarm systems", "SSWiN", "Structured cabling", "Cat5e", "Cat6", "RJ45", "IP equipment configuration", "Electronics diagnostics", "Micro-soldering", "PCB repair", "Technical support"],
    noticePeriod: "",
    salaryExpectation: "",
    workAuthorization: "Available for relocation to Poland; requires Type A work permit",
    englishLevel: "Intermediate (B2)",
    cvOnPracuj: false,
    answers: { driving_license: "Category B", arabic_level: "Native", polish_level: "Basic (currently learning)", relocation: "Available for relocation to Poland" },
    consentAnswers: { data_processing_consent: true, marketing_consent: false },
    updatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
  });
  var defaultCampaign = () => {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    return { id: "campaign_elv_monter_instalacji", name: "Monter instalacji niskoprądowych - Poland", searchUrl: "https://pracafizyczna.pracuj.pl/praca/monter%20instalacji%20niskopr%C4%85dowych;kw", keywords: ["Monter instalacji niskoprądowych", "ELV technician", "CCTV", "video surveillance", "NVR", "access control", "intrusion alarm", "SSWiN", "structured cabling", "Cat6", "RJ45", "IP networks", "electronics diagnostics"], maxDiscovery: 50, mode: "REVIEW", rules: { locations: ["Poland", "Polska"], excludedCompanies: [], excludedKeywords: [], requireRemote: false, dailyApplicationLimit: 10, fitThreshold: 45 }, createdAt: timestamp, updatedAt: timestamp };
  };
  var emptyRun = () => ({
    campaignId: null,
    phase: "IDLE",
    activeJobId: null,
    activeTabId: null,
    stopRequestedAt: null,
    queueJobIds: [],
    discoveryJobIds: [],
    cursor: 0,
    message: "No active campaign.",
    updatedAt: (/* @__PURE__ */ new Date(0)).toISOString()
  });
  var emptyState = () => ({
    schemaVersion: 1,
    campaigns: [defaultCampaign()],
    profile: emptyProfile(),
    jobs: [],
    forms: {},
    applications: [],
    events: [],
    run: emptyRun(),
    settings: { apiBaseUrl: "http://127.0.0.1:8787", usePolicyService: false }
  });
  var MAX_AUDIT_LOGS = 2e3;

  // src/shared/text.ts
  function uid(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  function now() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function tokens(value) {
    return normalize(value).split(/\s+/).filter((part) => part.length > 1);
  }
  function unique(items) {
    return [...new Set(items)];
  }
  function profileValueForField(profile, field) {
    switch (field.canonicalKey) {
      case "first_name":
        return profile.firstName || null;
      case "last_name":
        return profile.lastName || null;
      case "full_name":
        return [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null;
      case "email":
        return profile.email || null;
      case "phone":
        return profile.phone || null;
      case "city":
        return profile.city || null;
      case "linkedin_url":
        return profile.linkedinUrl || null;
      case "portfolio_url":
        return profile.portfolioUrl || null;
      case "notice_period":
        return profile.noticePeriod || null;
      case "salary_expectation":
        return profile.salaryExpectation || null;
      case "work_authorization":
        return profile.workAuthorization || null;
      case "english_level":
        return profile.englishLevel || null;
      case "years_experience":
        return profile.yearsExperience || null;
      case "data_processing_consent":
        return profile.consentAnswers.data_processing_consent ?? null;
      default:
        return profile.answers[field.canonicalKey] || profile.answers[normalize(field.label)] || null;
    }
  }
  function textContainsAny(text, values) {
    const normalized = normalize(text);
    return values.some((value) => value && normalized.includes(normalize(value)));
  }

  // src/shared/policy.ts
  var externalSignals = ["external application flow"];
  function calculateFit(job, campaign, profile) {
    const reasons = [];
    const haystack = `${job.title} ${job.description} ${job.location}`;
    const haystackTokens = new Set(tokens(haystack));
    let score = 0;
    const matchingKeywords = campaign.keywords.filter((keyword) => tokens(keyword).every((part) => haystackTokens.has(part)));
    if (matchingKeywords.length) {
      score += Math.min(38, matchingKeywords.length * 19);
      reasons.push(`Matched target: ${matchingKeywords.join(", ")}`);
    }
    const skillMatches = unique(profile.skills.filter((skill) => tokens(skill).some((part) => haystackTokens.has(part))));
    if (skillMatches.length) {
      score += Math.min(32, skillMatches.length * 8);
      reasons.push(`Relevant skills: ${skillMatches.slice(0, 4).join(", ")}`);
    }
    if (profile.currentTitle && tokens(job.title).some((part) => tokens(profile.currentTitle).includes(part))) {
      score += 12;
      reasons.push("Title overlaps current profile.");
    }
    if (campaign.rules.requireRemote && /remote|hybrid|zdaln/.test(haystack.toLowerCase())) {
      score += 10;
      reasons.push("Matches remote/hybrid requirement.");
    }
    if (campaign.rules.locations.length && textContainsAny(job.location, campaign.rules.locations)) {
      score += 8;
      reasons.push("Matches preferred location.");
    }
    if (campaign.rules.minimumSalary && job.salaryText && /\d/.test(job.salaryText)) {
      const salaryNumbers = job.salaryText.match(/[\d\s]+/g)?.map((item) => Number(item.replace(/\s/g, ""))).filter(Number.isFinite) ?? [];
      if (salaryNumbers.some((amount) => amount >= campaign.rules.minimumSalary)) {
        score += 8;
        reasons.push("Published salary meets campaign floor.");
      }
    }
    return { score: Math.min(100, score), reasons };
  }
  function evaluateLocally(job, form, campaign, profile) {
    const { score, reasons } = calculateFit(job, campaign, profile);
    const blockingSignals = [];
    const missingFields = [];
    const jobText = `${job.title} ${job.company} ${job.description} ${job.location}`;
    if (job.applicationKind !== "INTERNAL") blockingSignals.push(...externalSignals);
    if (campaign.rules.excludedCompanies.length && textContainsAny(job.company, campaign.rules.excludedCompanies)) blockingSignals.push("Company is excluded by campaign policy.");
    if (campaign.rules.excludedKeywords.length && textContainsAny(jobText, campaign.rules.excludedKeywords)) blockingSignals.push("Listing contains an excluded keyword.");
    if (campaign.rules.requireRemote && !/remote|hybrid|zdaln/i.test(jobText)) blockingSignals.push("Listing does not satisfy remote/hybrid requirement.");
    if (score < campaign.rules.fitThreshold) blockingSignals.push(`Fit score ${score} is below campaign threshold ${campaign.rules.fitThreshold}.`);
    if (!profile.cvOnPracuj) blockingSignals.push("Pracuj.pl default CV has not been confirmed in the candidate profile.");
    if (!form) blockingSignals.push("No live internal form map is available.");
    if (form?.hasCaptcha) blockingSignals.push("Captcha detected; manual intervention is required.");
    if (form?.hasVerification) blockingSignals.push("Verification step detected; manual intervention is required.");
    for (const field of form?.fields ?? []) {
      const value = profileValueForField(profile, field);
      if (field.required && (value === null || value === "")) missingFields.push(field.label);
      if (field.isSensitive && field.required) blockingSignals.push(`Sensitive question requires review: ${field.label}`);
      if (field.inputKind === "file" && field.required && !profile.cvOnPracuj) missingFields.push(field.label);
    }
    if (blockingSignals.some((item) => item.includes("excluded") || item.includes("external") || item.includes("does not satisfy"))) {
      return { decision: "SKIP", fitScore: score, reasons, missingFields, blockingSignals, selectedCv: null };
    }
    if (blockingSignals.length || missingFields.length) {
      return { decision: "REVIEW_REQUIRED", fitScore: score, reasons, missingFields, blockingSignals, selectedCv: profile.cvOnPracuj ? "PRACUJ_DEFAULT_CV" : null };
    }
    return { decision: "AUTO_SUBMIT_ALLOWED", fitScore: score, reasons, missingFields, blockingSignals, selectedCv: "PRACUJ_DEFAULT_CV" };
  }

  // src/shared/api.ts
  async function evaluateApplication(state, job, form, campaign) {
    if (!state.settings.usePolicyService) return evaluateLocally(job, form, campaign, state.profile);
    try {
      const response = await fetch(`${state.settings.apiBaseUrl.replace(/\/$/, "")}/v1/policy/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign, profile: state.profile, job, form: form ?? null })
      });
      if (!response.ok) throw new Error(`Policy service returned ${response.status}`);
      return await response.json();
    } catch (error) {
      console.warn("Policy service unavailable; using local deterministic policy.", error);
      return evaluateLocally(job, form, campaign, state.profile);
    }
  }

  // src/shared/storage.ts
  var lock = Promise.resolve();
  function clone(value) {
    return structuredClone(value);
  }
  async function getState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!stored) return emptyState();
    const state = clone(stored);
    let changed = false;
    if (!state.campaigns.some((campaign) => campaign.id === "campaign_elv_monter_instalacji")) {
      state.campaigns.unshift(defaultCampaign());
      changed = true;
    }
    if (!state.profile.firstName && !state.profile.lastName && !state.profile.email) {
      state.profile = emptyProfile();
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ [STORAGE_KEY]: state });
    return state;
  }
  async function setState(state) {
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    return clone(state);
  }
  async function updateState(mutator) {
    const next = lock.then(async () => {
      const state = await getState();
      await mutator(state);
      return setState(state);
    });
    lock = next.then(() => void 0, () => void 0);
    return next;
  }

  // src/background/coordinator.ts
  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  function activeCampaign(state, campaignId) {
    return state.campaigns.find((campaign) => campaign.id === campaignId);
  }
  function isPracujSearchUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return url.protocol === "https:" && (host === "pracuj.pl" || host.endsWith(".pracuj.pl"));
    } catch {
      return false;
    }
  }
  function isAllowedPolicyUrl(value) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && (host === "127.0.0.1" || host === "localhost") && (url.port === "" || url.port === "8787");
    } catch {
      return false;
    }
  }
  function isTerminal(status) {
    return ["SUBMITTED", "NEEDS_REVIEW", "SKIPPED", "FAILED", "INTERRUPTED"].includes(status);
  }
  function todayPrefix() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  var RunCoordinator = class {
    queue = Promise.resolve();
    inFlight = /* @__PURE__ */ new Set();
    install() {
      chrome.tabs.onUpdated.addListener((tabId, change) => {
        if (change.status !== "complete") return;
        void this.serial(() => this.onTabReady(tabId));
      });
      chrome.tabs.onRemoved.addListener((tabId) => {
        void this.serial(async () => {
          const state = await getState();
          if (state.run.activeTabId !== tabId) return;
          await this.patchRun({ activeTabId: null, phase: "PAUSED", message: "Automation tab was closed. Resume to continue safely." });
          await this.event(state.run.campaignId, state.run.activeJobId, "TAB_CLOSED", "Automation tab closed; run paused.", "WARNING");
        });
      });
    }
    async handle(message, sender) {
      switch (message.type) {
        case "GET_STATE":
          return getState();
        case "OPEN_DASHBOARD": {
          const sourceTabId = sender.tab?.id;
          const suffix = sourceTabId === void 0 ? "" : `?sourceTabId=${sourceTabId}`;
          await chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html${suffix}`) });
          return { ok: true };
        }
        case "SAVE_CAMPAIGN":
          await this.saveCampaign(message.campaign);
          return { ok: true };
        case "SAVE_PROFILE":
          await updateState((state) => {
            state.profile = message.profile;
          });
          await this.event(null, null, "PROFILE_SAVED", "Candidate profile updated.", "INFO");
          return { ok: true };
        case "SAVE_SETTINGS":
          if (!message.settings || !isAllowedPolicyUrl(message.settings.apiBaseUrl)) throw new Error("Policy service URL must use localhost or 127.0.0.1 on port 8787.");
          await updateState((state) => {
            state.settings = message.settings;
          });
          return { ok: true };
        case "START_DISCOVERY":
          await this.startDiscovery(message.campaignId, message.sourceTabId);
          return { ok: true };
        case "START_RUN":
          await this.startRun(message.campaignId);
          return { ok: true };
        case "STOP_RUN":
          await this.stop();
          return { ok: true };
        case "RESET_RUN":
          await this.reset();
          return { ok: true };
        case "CONTENT_EVENT":
          return { ok: true, received: message.event.type, senderTabId: sender.tab?.id ?? null };
        default:
          return { ok: false, error: "Unsupported runtime message." };
      }
    }
    serial(work) {
      const next = this.queue.then(work, work);
      this.queue = next.then(() => void 0, () => void 0);
      return next;
    }
    async saveCampaign(campaign) {
      if (!campaign || !isPracujSearchUrl(campaign.searchUrl)) throw new Error("Campaign search URL must be an HTTPS Pracuj.pl search page.");
      await updateState((state) => {
        const existing = state.campaigns.findIndex((item) => item.id === campaign.id);
        if (existing >= 0) state.campaigns[existing] = campaign;
        else state.campaigns.unshift(campaign);
      });
      await this.event(campaign.id, null, "CAMPAIGN_SAVED", `Campaign \u201C${campaign.name}\u201D saved.`, "INFO");
    }
    async startDiscovery(campaignId, sourceTabId) {
      const state = await getState();
      const campaign = activeCampaign(state, campaignId);
      if (!campaign) throw new Error("Campaign does not exist.");
      if (state.run.phase === "DISCOVERING" || state.run.phase === "RUNNING" || state.run.phase === "STOP_REQUESTED") throw new Error("Another workflow is already active. Stop or reset it first.");
      const response = await this.sendToTab(sourceTabId, { type: "GET_SEARCH_RESULTS" });
      const items = response.items ?? [];
      if (!items.length) throw new Error("No job links were discovered. Open a Pracuj.pl search-results page first.");
      const selected = items.slice(0, campaign.maxDiscovery);
      const startedAt = now();
      await updateState((next) => {
        const existingByUrl = new Map(next.jobs.filter((job) => job.campaignId === campaignId).map((job) => [job.url, job]));
        const jobIds = [];
        for (const item of selected) {
          const existing = existingByUrl.get(item.url);
          if (existing) {
            jobIds.push(existing.id);
            continue;
          }
          const job = {
            id: uid("job"),
            campaignId,
            url: item.url,
            title: item.title,
            company: item.company,
            location: item.location,
            salaryText: "",
            description: "",
            publishedText: "",
            applicationKind: "UNKNOWN",
            applicationUrl: "",
            discoveredAt: startedAt,
            updatedAt: startedAt,
            flags: []
          };
          next.jobs.push(job);
          jobIds.push(job.id);
        }
        next.run = {
          campaignId,
          phase: "DISCOVERING",
          activeJobId: null,
          activeTabId: sourceTabId,
          stopRequestedAt: null,
          discoveryJobIds: jobIds,
          queueJobIds: [],
          cursor: 0,
          message: `Discovery started: 0 of ${jobIds.length} listings audited.`,
          updatedAt: startedAt
        };
      });
      await this.event(campaignId, null, "DISCOVERY_STARTED", `Safe audit started for ${selected.length} listings. No applications will be sent.`, "INFO");
      await this.advanceDiscovery();
    }
    async advanceDiscovery() {
      const state = await getState();
      const run = state.run;
      if (run.phase === "STOP_REQUESTED") {
        await this.patchRun({ phase: "PAUSED", message: "Discovery stopped by user; checkpoint saved." });
        return;
      }
      if (run.phase !== "DISCOVERING") return;
      const jobId = run.discoveryJobIds[run.cursor];
      if (!jobId) {
        await this.patchRun({ phase: "READY", activeJobId: null, message: "Discovery complete. Complete the profile and review readiness." });
        await this.event(run.campaignId, null, "DISCOVERY_COMPLETED", "Discovery completed; application run is ready for preflight.", "INFO");
        return;
      }
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job || run.activeTabId === null) throw new Error("Discovery queue is invalid.");
      await this.patchRun({ activeJobId: jobId, message: `Auditing ${run.cursor + 1} of ${run.discoveryJobIds.length}: ${job.title}` });
      await chrome.tabs.update(run.activeTabId, { url: job.url, active: false });
    }
    async startRun(campaignId) {
      const state = await getState();
      const campaign = activeCampaign(state, campaignId);
      if (!campaign) throw new Error("Campaign does not exist.");
      if (state.run.phase === "DISCOVERING" || state.run.phase === "RUNNING" || state.run.phase === "STOP_REQUESTED") throw new Error("Another workflow is already active. Stop or reset it first.");
      if (!state.profile.firstName || !state.profile.lastName || !state.profile.email || !state.profile.cvOnPracuj) {
        throw new Error("Candidate profile is incomplete. Enter your name, email, and confirm the default Pracuj.pl CV before starting a run.");
      }
      const terminalJobIds = new Set(state.applications.filter((record) => isTerminal(record.status)).map((record) => record.jobId));
      const queue = state.jobs.filter((job) => job.campaignId === campaignId && job.applicationKind === "INTERNAL" && Boolean(state.forms[job.id]) && !terminalJobIds.has(job.id)).map((job) => job.id);
      if (!queue.length) throw new Error("No internal, unprocessed jobs are ready. Finish discovery or review your job statuses.");
      const existingTab = (await chrome.tabs.query({ url: ["https://www.pracuj.pl/*", "https://pracuj.pl/*", "https://*.pracuj.pl/*"] }))[0];
      const tab = existingTab ?? await chrome.tabs.create({ url: state.jobs.find((job) => job.id === queue[0]).url, active: false });
      await updateState((next) => {
        next.run = {
          campaignId,
          phase: "RUNNING",
          activeJobId: null,
          activeTabId: tab.id ?? null,
          stopRequestedAt: null,
          discoveryJobIds: [],
          queueJobIds: queue,
          cursor: 0,
          message: `Run started: ${queue.length} internal jobs queued.`,
          updatedAt: now()
        };
      });
      await this.event(campaignId, null, "RUN_STARTED", `Application run started with ${queue.length} internal listings; mode: ${campaign.mode}.`, "INFO");
      await this.advanceRun();
    }
    async advanceRun() {
      const state = await getState();
      const run = state.run;
      if (run.phase === "STOP_REQUESTED") {
        await this.patchRun({ phase: "PAUSED", message: "Run stopped by user; no new job will be started." });
        await this.event(run.campaignId, run.activeJobId, "RUN_PAUSED", "Stop checkpoint reached.", "INFO");
        return;
      }
      if (run.phase !== "RUNNING") return;
      const campaign = activeCampaign(state, run.campaignId);
      if (!campaign) throw new Error("Campaign is unavailable.");
      const submittedToday = state.applications.filter((item) => item.campaignId === campaign.id && item.status === "SUBMITTED" && item.submittedAt.startsWith(todayPrefix())).length;
      if (submittedToday >= campaign.rules.dailyApplicationLimit) {
        await this.patchRun({ phase: "COMPLETED", activeJobId: null, message: `Daily limit of ${campaign.rules.dailyApplicationLimit} submitted applications reached.` });
        await this.event(campaign.id, null, "DAILY_LIMIT_REACHED", "Run completed at the daily submission limit.", "INFO");
        return;
      }
      const jobId = run.queueJobIds[run.cursor];
      if (!jobId) {
        await this.patchRun({ phase: "COMPLETED", activeJobId: null, message: "Application queue completed." });
        await this.event(campaign.id, null, "RUN_COMPLETED", "No more eligible jobs remain in the queue.", "INFO");
        return;
      }
      const job = state.jobs.find((item) => item.id === jobId);
      if (!job || run.activeTabId === null) throw new Error("Run queue is invalid.");
      await this.patchRun({ activeJobId: jobId, message: `Preparing ${run.cursor + 1} of ${run.queueJobIds.length}: ${job.title}` });
      await chrome.tabs.update(run.activeTabId, { url: job.url, active: false });
    }
    async onTabReady(tabId) {
      const state = await getState();
      if (state.run.activeTabId !== tabId || !state.run.activeJobId) return;
      const uniqueKey = `${state.run.phase}:${state.run.activeJobId}`;
      if (this.inFlight.has(uniqueKey)) return;
      this.inFlight.add(uniqueKey);
      try {
        await delay(550);
        if (state.run.phase === "DISCOVERING") await this.processDiscovery(tabId, state.run.activeJobId);
        else if (state.run.phase === "RUNNING") await this.processRun(tabId, state.run.activeJobId);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const current = await getState();
        if (current.run.activeJobId === state.run.activeJobId && current.run.phase === "DISCOVERING") {
          await this.finishDiscoveryItem(state.run.activeJobId, `Audit could not safely complete: ${detail}`, "WARNING");
        } else if (current.run.activeJobId === state.run.activeJobId && current.run.phase === "RUNNING") {
          const job = current.jobs.find((item) => item.id === state.run.activeJobId);
          if (job) await this.finishRunItem(job, "NEEDS_REVIEW", 0, `Automation paused because the live page could not be verified: ${detail}`);
        }
      } finally {
        this.inFlight.delete(uniqueKey);
      }
    }
    async processDiscovery(tabId, jobId) {
      const before = await getState();
      const response = await this.sendToTab(tabId, { type: "AUDIT_CURRENT_JOB", jobId, openApplication: true });
      if (!response.ok || !response.job) {
        await this.finishDiscoveryItem(jobId, `Could not audit listing: ${response.error ?? "unknown content error"}`, "WARNING");
        return;
      }
      const auditedJob = response.job;
      await updateState((state) => {
        const job = state.jobs.find((item) => item.id === jobId);
        if (!job) return;
        Object.assign(job, auditedJob, { updatedAt: now() });
        if (response.form) state.forms[jobId] = response.form;
        if (auditedJob.applicationKind === "EXTERNAL") this.upsertApplicationInState(state, job, "SKIPPED", "External ATS/application flow is outside v1 scope.", 0);
      });
      await this.event(before.run.campaignId, jobId, "JOB_AUDITED", response.form ? `Internal form mapped (${response.form.fields.length} fields).` : `Listing classified as ${auditedJob.applicationKind}.`, "INFO");
      await this.finishDiscoveryItem(jobId, "Discovery checkpoint saved.", "INFO");
    }
    async finishDiscoveryItem(jobId, detail, level) {
      await updateState((state) => {
        if (state.run.phase !== "DISCOVERING" && state.run.phase !== "STOP_REQUESTED") return;
        if (state.run.activeJobId !== jobId) return;
        state.run.cursor += 1;
        state.run.activeJobId = null;
        state.run.message = detail;
        state.run.updatedAt = now();
      });
      await this.advanceDiscovery();
    }
    async processRun(tabId, jobId) {
      const state = await getState();
      const campaign = activeCampaign(state, state.run.campaignId);
      const job = state.jobs.find((item) => item.id === jobId);
      if (!campaign || !job) throw new Error("Active run context is unavailable.");
      const policy = await evaluateApplication(state, job, state.forms[jobId], campaign);
      if (policy.decision === "SKIP") {
        await this.finishRunItem(job, "SKIPPED", policy.fitScore, [...policy.reasons, ...policy.blockingSignals].join(" "));
        return;
      }
      const authorizeSubmit = campaign.mode === "TRUSTED_AUTO_SUBMIT" && policy.decision === "AUTO_SUBMIT_ALLOWED";
      const response = await this.sendToTab(tabId, {
        type: "PREPARE_CURRENT_APPLICATION",
        jobId,
        profile: state.profile,
        authorizeSubmit
      });
      if (!response.ok || !response.job || !response.result) {
        await this.finishRunItem(job, "FAILED", policy.fitScore, `Content executor error: ${response.error ?? "invalid response"}`);
        return;
      }
      await updateState((next) => {
        const storedJob = next.jobs.find((item) => item.id === jobId);
        if (storedJob) Object.assign(storedJob, response.job, { updatedAt: now(), fitScore: policy.fitScore });
        if (response.form) next.forms[jobId] = response.form;
      });
      const statusMap = {
        SUBMITTED: "SUBMITTED",
        READY: "NEEDS_REVIEW",
        NEEDS_REVIEW: "NEEDS_REVIEW",
        SKIPPED: "SKIPPED",
        FAILED: "FAILED"
      };
      const outcome = statusMap[response.result.status] ?? "FAILED";
      const reason = [response.result.message, ...policy.reasons, ...policy.blockingSignals, ...response.result.missingFields.map((field) => `Missing: ${field}`)].filter(Boolean).join(" ");
      await this.finishRunItem(job, outcome, policy.fitScore, reason);
    }
    async finishRunItem(job, status, fitScore, reason) {
      let shouldPause = status === "NEEDS_REVIEW";
      await updateState((state) => {
        this.upsertApplicationInState(state, job, status, reason, fitScore);
        if (state.run.activeJobId !== job.id) return;
        state.run.cursor += 1;
        state.run.activeJobId = null;
        state.run.message = `${job.title}: ${status.replace("_", " ").toLowerCase()}.`;
        state.run.updatedAt = now();
        if (shouldPause) state.run.phase = "PAUSED";
      });
      await this.event(job.campaignId, job.id, `APPLICATION_${status}`, reason, status === "FAILED" ? "ERROR" : status === "NEEDS_REVIEW" ? "WARNING" : "INFO");
      const current = await getState();
      if (current.run.phase === "PAUSED") return;
      await this.advanceRun();
    }
    upsertApplicationInState(state, job, status, reason, fitScore) {
      const time = now();
      const existing = state.applications.find((item) => item.jobId === job.id);
      const record = {
        id: existing?.id ?? uid("application"),
        campaignId: job.campaignId,
        jobId: job.id,
        title: job.title,
        company: job.company,
        jobUrl: job.url,
        applicationKind: job.applicationKind,
        fitScore,
        status,
        reason,
        submittedAt: status === "SUBMITTED" ? time : existing?.submittedAt ?? "",
        createdAt: existing?.createdAt ?? time,
        updatedAt: time
      };
      if (existing) Object.assign(existing, record);
      else state.applications.unshift(record);
    }
    async stop() {
      const state = await getState();
      if (!["DISCOVERING", "RUNNING", "STOP_REQUESTED"].includes(state.run.phase)) return;
      await this.patchRun({ phase: "STOP_REQUESTED", stopRequestedAt: now(), message: "Stop requested. Current page will checkpoint; no next job will start." });
      await this.event(state.run.campaignId, state.run.activeJobId, "STOP_REQUESTED", "User requested a safe stop.", "INFO");
      if (!state.run.activeJobId) {
        await this.patchRun({ phase: "PAUSED", message: "Stopped safely." });
      }
    }
    async reset() {
      await updateState((state) => {
        state.run = { campaignId: null, phase: "IDLE", activeJobId: null, activeTabId: null, stopRequestedAt: null, queueJobIds: [], discoveryJobIds: [], cursor: 0, message: "Run reset.", updatedAt: now() };
      });
    }
    async patchRun(patch) {
      await updateState((state) => {
        Object.assign(state.run, patch, { updatedAt: now() });
      });
    }
    async event(campaignId, jobId, action, detail, level) {
      await updateState((state) => {
        state.events.unshift({ id: uid("event"), campaignId, jobId, action, detail, level, occurredAt: now() });
        if (state.events.length > MAX_AUDIT_LOGS) state.events.length = MAX_AUDIT_LOGS;
      });
    }
    async sendToTab(tabId, message) {
      let lastError;
      let reloaded = false;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
          lastError = error;
          if (!reloaded) {
            reloaded = true;
            try {
              await chrome.tabs.reload(tabId);
              await delay(1e3);
            } catch (reloadError) {
              lastError = reloadError;
            }
          }
          await delay(300);
        }
      }
      throw new Error(`Unable to reach page adapter: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    }
  };

  // src/background/index.ts
  var coordinator = new RunCoordinator();
  coordinator.install();
  chrome.runtime.onInstalled.addListener(() => {
    console.info("ApplyPilot installed. Open the dashboard to create a campaign.");
  });
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    coordinator.handle(message, sender).then((response) => sendResponse({ ok: true, data: response })).catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error("ApplyPilot background failure", error);
      sendResponse({ ok: false, error: detail });
    });
    return true;
  });
})();
//# sourceMappingURL=background.js.map
