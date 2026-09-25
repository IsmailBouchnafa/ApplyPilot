"use strict";
(() => {
  // src/shared/constants.ts
  var DEFAULT_DISCOVERY_SAMPLE = 50;

  // src/shared/text.ts
  function uid(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

  // src/ui/dashboard/main.ts
  function getRoot() {
    const element = document.querySelector("#app");
    if (!element) throw new Error("Missing dashboard root.");
    return element;
  }
  var root = getRoot();
  var state;
  var activeView = "overview";
  var sourceTabId = Number(new URLSearchParams(location.search).get("sourceTabId")) || null;
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Extension request failed.");
    return response.data;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
  }
  function lineList(values) {
    return values.join(", ");
  }
  function splitList(value) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
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
  function phaseLabel(phase) {
    return phase.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  function phaseDot(phase) {
    return phase === "RUNNING" || phase === "DISCOVERING" ? "running" : phase === "STOP_REQUESTED" || phase === "ERROR" ? "stop" : phase === "READY" ? "ready" : "";
  }
  function selectedCampaign() {
    return state.campaigns.find((item) => item.id === state.run.campaignId) ?? state.campaigns[0];
  }
  function statusBadge(status) {
    return `<span class="badge ${escapeHtml(status.toLowerCase())}">${escapeHtml(status.replaceAll("_", " "))}</span>`;
  }
  function formatDate(iso) {
    return iso ? new Intl.DateTimeFormat(void 0, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "\u2014";
  }
  function toast(message, type = "success") {
    document.querySelector(".toast")?.remove();
    const element = document.createElement("div");
    element.className = `toast ${type}`;
    element.textContent = message;
    document.body.append(element);
    window.setTimeout(() => element.remove(), 4500);
  }
  async function refresh() {
    state = await request({ type: "GET_STATE" });
    render();
  }
  function render() {
    const campaign = selectedCampaign();
    const audited = campaign ? state.jobs.filter((job) => job.campaignId === campaign.id).length : 0;
    const submitted = campaign ? state.applications.filter((item) => item.campaignId === campaign.id && item.status === "SUBMITTED").length : 0;
    const review = campaign ? state.applications.filter((item) => item.campaignId === campaign.id && item.status === "NEEDS_REVIEW").length : 0;
    root.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div><div class="brand"><div class="brand-mark">A</div><div><h1>ApplyPilot <span style="font-weight:500;color:#65738b">/ Pracuj Agent</span></h1><p>Auditable, one-at-a-time job applications. The automation does not guess, bypass protections, or submit external ATS forms.</p></div></div></div>
      <div class="status"><span class="dot ${phaseDot(state.run.phase)}"></span>${phaseLabel(state.run.phase)}</div>
    </header>
    <nav class="tabs" aria-label="Dashboard sections">
      ${tab("overview", "Overview")}${tab("campaign", "Campaign")}${tab("profile", "Candidate profile")}${tab("run", "Run & audit")}${tab("settings", "Connection & safety")}
    </nav>
    <section id="view-overview" class="view ${activeView === "overview" ? "active" : ""}">${overview(campaign, audited, submitted, review)}</section>
    <section id="view-campaign" class="view ${activeView === "campaign" ? "active" : ""}">${campaignView(campaign)}</section>
    <section id="view-profile" class="view ${activeView === "profile" ? "active" : ""}">${profileView(campaign)}</section>
    <section id="view-run" class="view ${activeView === "run" ? "active" : ""}">${runView(campaign)}</section>
    <section id="view-settings" class="view ${activeView === "settings" ? "active" : ""}">${settingsView()}</section>
  </div>`;
    bindTabs();
    bindOverview();
    bindCampaign();
    bindProfile();
    bindRun();
    bindSettings();
  }
  function tab(id, label) {
    return `<button class="tab ${activeView === id ? "active" : ""}" data-tab="${id}">${label}</button>`;
  }
  function overview(campaign, audited, submitted, review) {
    const queueRemaining = Math.max(0, state.run.queueJobIds.length - state.run.cursor);
    const discoveryTotal = state.run.discoveryJobIds.length;
    const progress = state.run.phase === "DISCOVERING" && discoveryTotal ? Math.round(state.run.cursor / discoveryTotal * 100) : 0;
    return `<div class="grid three">
    <article class="card"><div class="label">Audited listings</div><div class="stat">${audited}</div><div class="intro">Internal form schemas are captured without submitting an application.</div></article>
    <article class="card"><div class="label">Submitted</div><div class="stat">${submitted}</div><div class="intro">Only page-confirmed submissions receive this status.</div></article>
    <article class="card"><div class="label">Needs review</div><div class="stat">${review}</div><div class="intro">Unknown or sensitive fields are held\u2014not guessed.</div></article>
  </div>
  <div class="grid two" style="margin-top:18px">
    <article class="card"><h2>${campaign ? escapeHtml(campaign.name) : "Create your first campaign"}</h2><p class="intro">${campaign ? `Mode: <b>${escapeHtml(campaign.mode.replaceAll("_", " "))}</b> \xB7 Fit threshold: <b>${campaign.rules.fitThreshold}%</b> \xB7 Daily cap: <b>${campaign.rules.dailyApplicationLimit}</b>` : "Start by recording the Pracuj.pl search URL and your targeting rules."}</p>
      ${state.run.phase === "DISCOVERING" ? `<div class="progress"><span style="width:${progress}%"></span></div><div class="label">Discovery ${state.run.cursor} / ${discoveryTotal}</div>` : ""}
      ${state.run.phase === "RUNNING" || state.run.phase === "STOP_REQUESTED" ? `<div class="notice info"><b>${escapeHtml(state.run.message)}</b><br>${queueRemaining} jobs remain in the queued run.</div>` : ""}
      ${state.run.phase === "PAUSED" ? `<div class="notice warn"><b>Run paused.</b> ${escapeHtml(state.run.message)} Review the audit table, then resume by starting a fresh queue after resolving the hold.</div>` : ""}
      <div class="row wrap"><button class="button" data-go="campaign">${campaign ? "Edit campaign" : "Create campaign"}</button>${campaign ? '<button class="button secondary" data-go="profile">Open profile readiness</button>' : ""}${["DISCOVERING", "RUNNING", "STOP_REQUESTED"].includes(state.run.phase) ? '<button id="overview-stop" class="button danger">Stop safely</button>' : ""}</div>
    </article>
    <article class="card"><h2>Safety contract</h2><div class="step"><div class="step-icon">1</div><div><b>Discovery never sends</b><p>It opens only internal application forms and records their requirements.</p></div></div><div class="step"><div class="step-icon">2</div><div><b>Live form recheck</b><p>Every field is re-inspected immediately before form completion.</p></div></div><div class="step"><div class="step-icon">3</div><div><b>Pause on uncertainty</b><p>New, sensitive, CAPTCHA, verification, or unconfirmed submission states stop the queue.</p></div></div></article>
  </div>`;
  }
  function campaignView(campaign) {
    const value = campaign ?? draftCampaign();
    return `<div class="grid two"><article class="card"><h2>Targeting campaign</h2><p class="intro">Use the Pracuj.pl search results page URL after you apply your own board filters. Discovery will sample at most 50 listings and will never submit.</p>
    <form id="campaign-form">
      <div class="field"><label for="campaign-name">Campaign name</label><input id="campaign-name" name="name" required value="${escapeHtml(value.name)}" placeholder="Data Analyst \u2013 Poland"></div>
      <div class="field"><label for="campaign-search">Pracuj.pl search URL</label><input id="campaign-search" name="searchUrl" type="url" required value="${escapeHtml(value.searchUrl)}" placeholder="https://www.pracuj.pl/praca?..."><small>This must be a Pracuj.pl search listing, not a single job.</small></div>
      <div class="field"><label for="campaign-keywords">Target keywords</label><input id="campaign-keywords" name="keywords" required value="${escapeHtml(lineList(value.keywords))}" placeholder="Data Analyst, BI Analyst, SQL"><small>Separate phrases with commas.</small></div>
      <div class="row"><div class="field"><label for="fit-threshold">Minimum fit score</label><input id="fit-threshold" name="fitThreshold" type="number" min="0" max="100" value="${value.rules.fitThreshold}"></div><div class="field"><label for="daily-limit">Daily submit cap</label><input id="daily-limit" name="dailyLimit" type="number" min="1" max="100" value="${value.rules.dailyApplicationLimit}"></div><div class="field"><label for="sample-size">Discovery sample</label><input id="sample-size" name="maxDiscovery" type="number" min="1" max="50" value="${value.maxDiscovery}"></div></div>
      <div class="row"><div class="field"><label for="locations">Preferred locations</label><input id="locations" name="locations" value="${escapeHtml(lineList(value.rules.locations))}" placeholder="Warsaw, Krak\xF3w, Remote"></div><div class="field"><label for="min-salary">Minimum salary (optional)</label><input id="min-salary" name="minimumSalary" type="number" min="0" value="${value.rules.minimumSalary ?? ""}"></div></div>
      <div class="field"><label for="excluded-companies">Excluded companies</label><input id="excluded-companies" name="excludedCompanies" value="${escapeHtml(lineList(value.rules.excludedCompanies))}" placeholder="Company A, Company B"></div>
      <div class="field"><label for="excluded-keywords">Excluded keywords</label><input id="excluded-keywords" name="excludedKeywords" value="${escapeHtml(lineList(value.rules.excludedKeywords))}" placeholder="Intern, unpaid, commission only"></div>
      <label class="check"><input id="require-remote" name="requireRemote" type="checkbox" ${value.rules.requireRemote ? "checked" : ""}> Require the listing itself to indicate remote or hybrid work.</label>
      <label class="check"><input id="auto-mode" name="autoMode" type="checkbox" ${value.mode === "TRUSTED_AUTO_SUBMIT" ? "checked" : ""}> Enable <b>Trusted auto-submit</b> after profile coverage passes. Every live required field must still be approved and verified.</label>
      <div class="row wrap"><button class="button" type="submit">Save campaign</button><button class="button secondary" id="use-current-search" type="button">Use open Pracuj tab</button>${campaign ? '<button class="button secondary" id="start-discovery" type="button">Start safe discovery</button>' : ""}</div>
    </form>
  </article><aside class="card"><h2>Before discovery</h2><p class="intro">Confirm the following in your logged-in Pracuj.pl account:</p><div class="step"><div class="step-icon">\u2713</div><div><b>Default CV configured</b><p>v1 does not inject local files into a browser file input. Select your primary CV in Pracuj.pl first.</p></div></div><div class="step"><div class="step-icon">\u2713</div><div><b>Filters already selected</b><p>Capture a final keyword/location/contract search URL for the campaign.</p></div></div><div class="step"><div class="step-icon">\u2713</div><div><b>Terms reviewed</b><p>Do not use the tool to circumvent board controls or send misleading information.</p></div></div></aside></div>`;
  }
  var STANDARD_PROFILE_KEYS = /* @__PURE__ */ new Set(["first_name", "last_name", "full_name", "email", "phone", "city", "linkedin_url", "portfolio_url", "notice_period", "salary_expectation", "work_authorization", "english_level", "years_experience", "data_processing_consent", "cv"]);
  function discoveredCustomFields(campaign) {
    if (!campaign) return [];
    const jobIds = new Set(state.jobs.filter((job) => job.campaignId === campaign.id).map((job) => job.id));
    const byKey = /* @__PURE__ */ new Map();
    for (const form of Object.values(state.forms)) {
      if (!jobIds.has(form.jobId)) continue;
      for (const field of form.fields) {
        if (!field.required || STANDARD_PROFILE_KEYS.has(field.canonicalKey) || field.isSensitive || field.inputKind === "file" || field.inputKind === "checkbox") continue;
        if (!byKey.has(field.canonicalKey)) byKey.set(field.canonicalKey, field);
      }
    }
    return [...byKey.values()];
  }
  function customFieldControl(field, profile) {
    const value = profile.answers[field.canonicalKey] || "";
    const name = `custom__${field.canonicalKey}`;
    const help = field.options.length ? `Choose the approved answer for this mapped form field.` : `Mapped from the discovery sample; this value may be used only for the same field.`;
    if ((field.inputKind === "select" || field.inputKind === "radio") && field.options.length) {
      return `<div class="field"><label>${escapeHtml(field.label)} <span class="badge review">discovered required field</span></label><select name="${escapeHtml(name)}"><option value="">Choose an approved answer\u2026</option>${field.options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select><small>${escapeHtml(help)}</small></div>`;
    }
    const control = field.inputKind === "textarea" ? `<textarea name="${escapeHtml(name)}" placeholder="Enter a verified, reusable answer">${escapeHtml(value)}</textarea>` : `<input name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="Enter a verified answer">`;
    return `<div class="field"><label>${escapeHtml(field.label)} <span class="badge review">discovered required field</span></label>${control}<small>${escapeHtml(help)}</small></div>`;
  }
  function profileView(campaign) {
    const profile = state.profile;
    const readiness = calculateReadiness(campaign);
    const customFields = discoveredCustomFields(campaign);
    return `<div class="grid two"><article class="card"><h2>Candidate information</h2><p class="intro">This is the source of truth for automatic filling. The agent refuses to infer facts not entered here.</p><form id="profile-form">
    <div class="row"><div class="field"><label>First name</label><input name="firstName" required value="${escapeHtml(profile.firstName)}"></div><div class="field"><label>Last name</label><input name="lastName" required value="${escapeHtml(profile.lastName)}"></div></div>
    <div class="row"><div class="field"><label>Email</label><input name="email" type="email" required value="${escapeHtml(profile.email)}"></div><div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(profile.phone)}"></div></div>
    <div class="row"><div class="field"><label>City</label><input name="city" value="${escapeHtml(profile.city)}"></div><div class="field"><label>Current title</label><input name="currentTitle" value="${escapeHtml(profile.currentTitle)}"></div></div>
    <div class="field"><label>Skills</label><input name="skills" value="${escapeHtml(lineList(profile.skills))}" placeholder="SQL, Python, Power BI"><small>Comma separated. These feed a deterministic fit score.</small></div>
    <div class="row"><div class="field"><label>Years of experience</label><input name="yearsExperience" value="${escapeHtml(profile.yearsExperience)}"></div><div class="field"><label>English level</label><input name="englishLevel" value="${escapeHtml(profile.englishLevel)}" placeholder="C1"></div></div>
    <div class="row"><div class="field"><label>Notice period / availability</label><input name="noticePeriod" value="${escapeHtml(profile.noticePeriod)}"></div><div class="field"><label>Salary expectation</label><input name="salaryExpectation" value="${escapeHtml(profile.salaryExpectation)}" placeholder="e.g., 18000 PLN gross/month"></div></div>
    <div class="field"><label>Work authorization</label><input name="workAuthorization" value="${escapeHtml(profile.workAuthorization)}" placeholder="e.g., Eligible to work in Poland"></div>
    <div class="row"><div class="field"><label>LinkedIn URL</label><input name="linkedinUrl" type="url" value="${escapeHtml(profile.linkedinUrl)}"></div><div class="field"><label>Portfolio / GitHub URL</label><input name="portfolioUrl" type="url" value="${escapeHtml(profile.portfolioUrl)}"></div></div>
    <label class="check"><input name="cvOnPracuj" type="checkbox" ${profile.cvOnPracuj ? "checked" : ""}> I confirm my approved default CV is already uploaded and selected in my Pracuj.pl account.</label>
    <label class="check"><input name="dataConsent" type="checkbox" ${profile.consentAnswers.data_processing_consent ? "checked" : ""}> I approve automatic selection of a required recruitment-data-processing consent where the form label clearly maps to that purpose.</label>
    <div class="field"><label>Approved custom answers</label><textarea name="answers" placeholder="question_key = approved answer
why_are_you_interested = I am interested because\u2026">${escapeHtml(answerLines(profile.answers))}</textarea><small>Use one <code>field_key = answer</code> per line. Unknown or sensitive questions always pause the run.</small></div>
    ${customFields.length ? `<div class="rule"></div><h2>Fields discovered in the 50-job audit</h2><p class="intro">These are actual required non-sensitive fields found in the audited internal forms. Save a verified answer for each one you want the agent to reuse.</p>${customFields.map((field) => customFieldControl(field, profile)).join("")}` : ""}
    <button class="button" type="submit">Save profile & validate</button>
  </form></article>
  <aside class="card"><h2>Readiness report</h2><p class="intro">Based on form fields observed in the current discovery sample.</p>
    <div class="label">Coverage</div><div class="stat">${readiness.covered} / ${readiness.required}</div><div class="progress"><span style="width:${readiness.percent}%"></span></div>
    ${readiness.required ? `<p class="intro">${readiness.percent}% of unique required fields have an approved value.</p>` : '<div class="notice info">Complete discovery first to create a real form-coverage report.</div>'}
    ${readiness.missing.length ? `<div class="notice warn"><b>Missing or review-only:</b><br>${readiness.missing.slice(0, 12).map(escapeHtml).join("<br>")}</div>` : readiness.required ? '<div class="notice good"><b>Known required-field coverage is complete.</b> Each live form is still rechecked before any submission.</div>' : ""}
    <div class="rule"></div><h2>Known form map</h2>${readiness.forms ? `<p class="intro">${readiness.forms} internal forms mapped. ${readiness.external} external flows logged and excluded.</p>` : '<p class="intro">No jobs audited yet.</p>'}
    <p class="footer-note">A checked CV confirmation enables use of your board-configured default CV; it does not permit silent filesystem uploads.</p>
  </aside></div>`;
  }
  function runView(campaign) {
    const canStart = Boolean(campaign && state.run.phase !== "RUNNING" && state.run.phase !== "DISCOVERING" && state.run.phase !== "STOP_REQUESTED");
    const appRows = state.applications.filter((item) => !campaign || item.campaignId === campaign.id);
    return `<div class="grid two"><article class="card"><h2>Run controller</h2><p class="intro">${escapeHtml(state.run.message)}</p>
    <div class="row wrap">${canStart && campaign ? '<button id="start-run" class="button">Start internal application run</button>' : ""}${["RUNNING", "DISCOVERING", "STOP_REQUESTED"].includes(state.run.phase) ? '<button id="stop-run" class="button danger">Stop safely</button>' : ""}${state.run.phase === "PAUSED" ? '<button id="reset-run" class="button secondary">Clear paused state</button>' : ""}</div>
    <div class="rule"></div><div class="step"><div class="step-icon">1</div><div><b>Internal only</b><p>External application pages remain visible in the audit trail but are never opened in v1.</p></div></div><div class="step"><div class="step-icon">2</div><div><b>Trusted means all checks pass</b><p>Fit, consent, profile evidence, live required fields, and confirmation must all be present.</p></div></div><div class="step"><div class="step-icon">3</div><div><b>Needs review pauses</b><p>Resolve the entry manually, then clear the paused state to continue with remaining queue items.</p></div></div>
  </article><aside class="card"><h2>Latest operation</h2>${eventPanel()}</aside></div>
  <article class="card" style="margin-top:18px"><h2>Application table</h2><p class="intro">Every resulting job operation is saved with its decision and reason.</p><div class="audit-wrap"><table class="audit"><thead><tr><th>Time</th><th>Company / role</th><th>Fit</th><th>Kind</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>${appRows.length ? appRows.map((item) => `<tr><td>${escapeHtml(formatDate(item.updatedAt))}</td><td><b>${escapeHtml(item.company || "Unknown company")}</b><br>${escapeHtml(item.title)}</td><td>${item.fitScore || "\u2014"}%</td><td>${escapeHtml(item.applicationKind)}</td><td>${statusBadge(item.status)}</td><td>${escapeHtml(item.reason)}</td><td><a href="${escapeHtml(item.jobUrl)}" target="_blank" rel="noreferrer">Open</a></td></tr>`).join("") : '<tr><td colspan="7" class="empty">No application operations have been recorded yet.</td></tr>'}</tbody></table></div></article>`;
  }
  function settingsView() {
    return `<div class="grid two"><article class="card"><h2>Policy service</h2><p class="intro">The extension is usable with its local deterministic policy. Enable the optional FastAPI service for centrally logged policy decisions and later AI analysis.</p><form id="settings-form"><div class="field"><label>API base URL</label><input type="url" name="apiBaseUrl" value="${escapeHtml(state.settings.apiBaseUrl)}"></div><label class="check"><input name="usePolicyService" type="checkbox" ${state.settings.usePolicyService ? "checked" : ""}> Use the policy service when available; fall back locally if offline.</label><button class="button" type="submit">Save connection</button></form></article><aside class="card"><h2>Non-negotiable safety controls</h2><div class="step"><div class="step-icon">!</div><div><b>No credential collection</b><p>The extension uses your existing browser login. It does not request or store your Pracuj.pl password.</p></div></div><div class="step"><div class="step-icon">!</div><div><b>No bypassing</b><p>CAPTCHA, MFA, rate controls, verification, and blocked states are treated as stop conditions.</p></div></div><div class="step"><div class="step-icon">!</div><div><b>No fabricated data</b><p>A blank fact remains blank. It is never replaced by a generated answer.</p></div></div></aside></div>`;
  }
  function eventPanel() {
    const events = state.events.slice(0, 5);
    return events.length ? events.map((event) => `<div class="step"><div class="step-icon">${event.level === "ERROR" ? "\xD7" : event.level === "WARNING" ? "!" : "\u2713"}</div><div><b>${escapeHtml(event.action.replaceAll("_", " "))}</b><p>${escapeHtml(event.detail)}<br><span class="label">${escapeHtml(formatDate(event.occurredAt))}</span></p></div></div>`).join("") : '<div class="empty">No operations yet.</div>';
  }
  function calculateReadiness(campaign) {
    if (!campaign) return { required: 0, covered: 0, percent: 0, missing: [], forms: 0, external: 0 };
    const jobs = state.jobs.filter((job) => job.campaignId === campaign.id);
    const fields = Object.values(state.forms).filter((form) => jobs.some((job) => job.id === form.jobId)).flatMap((form) => form.fields.filter((field) => field.required));
    const uniqueFields = /* @__PURE__ */ new Map();
    for (const field of fields) uniqueFields.set(`${field.canonicalKey}:${field.inputKind}`, field);
    const fieldValues = Array.from(uniqueFields.values());
    const missing = fieldValues.filter((field) => {
      if (field.isSensitive) return true;
      const value = profileValueForField(state.profile, field);
      return value === null || value === "" || field.inputKind === "file" && !state.profile.cvOnPracuj;
    }).map((field) => `${field.label}${field.isSensitive ? " (sensitive, always review)" : ""}`);
    const required = fieldValues.length;
    const covered = required - missing.length;
    return { required, covered, percent: required ? Math.round(covered / required * 100) : 0, missing, forms: Object.keys(state.forms).length, external: jobs.filter((job) => job.applicationKind === "EXTERNAL").length };
  }
  function draftCampaign() {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    return { id: uid("campaign"), name: "My Pracuj campaign", searchUrl: "", keywords: [], maxDiscovery: DEFAULT_DISCOVERY_SAMPLE, mode: "REVIEW", rules: { locations: [], excludedCompanies: [], excludedKeywords: [], requireRemote: false, dailyApplicationLimit: 10, fitThreshold: 80 }, createdAt: timestamp, updatedAt: timestamp };
  }
  function answerLines(answers) {
    return Object.entries(answers).map(([key, value]) => `${key} = ${value}`).join("\n");
  }
  function parseAnswers(value) {
    const entries = [];
    for (const rawLine of value.split("\n")) {
      const line = rawLine.trim();
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      const answer = line.slice(separator + 1).trim();
      if (key && answer) entries.push([key, answer]);
    }
    return Object.fromEntries(entries);
  }
  function formValue(form, name) {
    return String(new FormData(form).get(name) ?? "").trim();
  }
  function isChecked(form, name) {
    return form.elements.namedItem(name)?.checked ?? false;
  }
  function bindTabs() {
    document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
      activeView = button.dataset.tab ?? "overview";
      render();
    }));
  }
  function bindOverview() {
    document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
      activeView = button.dataset.go ?? "overview";
      render();
    }));
    document.querySelector("#overview-stop")?.addEventListener("click", () => void stopRun());
  }
  function bindCampaign() {
    const form = document.querySelector("#campaign-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const current = selectedCampaign() ?? draftCampaign();
      const searchUrl = formValue(form, "searchUrl");
      if (!isPracujSearchUrl(searchUrl)) {
        toast("Enter an HTTPS Pracuj.pl search-results URL.", "error");
        return;
      }
      const saved = { ...current, name: formValue(form, "name"), searchUrl, keywords: splitList(formValue(form, "keywords")), maxDiscovery: Math.min(50, Math.max(1, Number(formValue(form, "maxDiscovery")) || DEFAULT_DISCOVERY_SAMPLE)), mode: isChecked(form, "autoMode") ? "TRUSTED_AUTO_SUBMIT" : "REVIEW", rules: { locations: splitList(formValue(form, "locations")), excludedCompanies: splitList(formValue(form, "excludedCompanies")), excludedKeywords: splitList(formValue(form, "excludedKeywords")), minimumSalary: Number(formValue(form, "minimumSalary")) || void 0, requireRemote: isChecked(form, "requireRemote"), dailyApplicationLimit: Math.max(1, Number(formValue(form, "dailyLimit")) || 10), fitThreshold: Math.min(100, Math.max(0, Number(formValue(form, "fitThreshold")) || 80)) }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      try {
        await request({ type: "SAVE_CAMPAIGN", campaign: saved });
        toast("Campaign saved.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
    document.querySelector("#use-current-search")?.addEventListener("click", async () => {
      const tabs = await chrome.tabs.query({ url: ["https://www.pracuj.pl/*", "https://pracuj.pl/*", "https://*.pracuj.pl/*"] });
      const tab2 = tabs.find((candidate) => candidate.url?.includes("/praca")) ?? tabs[0];
      if (tab2?.url?.includes("pracuj.pl")) {
        const input = document.querySelector("#campaign-search");
        if (input) input.value = tab2.url;
        toast("Open Pracuj.pl URL copied.");
      } else toast("Open the filtered Pracuj.pl search in a tab, then use this button.", "error");
    });
  }
  function bindProfile() {
    const form = document.querySelector("#profile-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const previous = state.profile;
      const discoveredAnswers = {};
      form.querySelectorAll('[name^="custom__"]').forEach((control) => {
        const key = control.name.slice("custom__".length);
        const value = control.value.trim();
        if (key && value) discoveredAnswers[key] = value;
      });
      const profile = { ...previous, firstName: formValue(form, "firstName"), lastName: formValue(form, "lastName"), email: formValue(form, "email"), phone: formValue(form, "phone"), city: formValue(form, "city"), linkedinUrl: formValue(form, "linkedinUrl"), portfolioUrl: formValue(form, "portfolioUrl"), currentTitle: formValue(form, "currentTitle"), yearsExperience: formValue(form, "yearsExperience"), skills: splitList(formValue(form, "skills")), noticePeriod: formValue(form, "noticePeriod"), salaryExpectation: formValue(form, "salaryExpectation"), workAuthorization: formValue(form, "workAuthorization"), englishLevel: formValue(form, "englishLevel"), cvOnPracuj: isChecked(form, "cvOnPracuj"), answers: { ...parseAnswers(formValue(form, "answers")), ...discoveredAnswers }, consentAnswers: { data_processing_consent: isChecked(form, "dataConsent"), marketing_consent: false }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      try {
        await request({ type: "SAVE_PROFILE", profile });
        toast("Candidate profile saved.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
  }
  function bindRun() {
    document.querySelector("#start-run")?.addEventListener("click", async () => {
      const campaign = selectedCampaign();
      if (!campaign) return;
      try {
        await request({ type: "START_RUN", campaignId: campaign.id });
        toast("Run started. Keep Chrome open; use Stop for a safe checkpoint.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
    document.querySelector("#stop-run")?.addEventListener("click", () => void stopRun());
    document.querySelector("#reset-run")?.addEventListener("click", async () => {
      try {
        await request({ type: "RESET_RUN" });
        toast("Paused state cleared.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
  }
  async function stopRun() {
    try {
      await request({ type: "STOP_RUN" });
      toast("Safe stop requested.");
      await refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    }
  }
  function bindSettings() {
    const form = document.querySelector("#settings-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const apiBaseUrl = formValue(form, "apiBaseUrl");
      if (!isAllowedPolicyUrl(apiBaseUrl)) {
        toast("Policy service URL must use localhost or 127.0.0.1 on port 8787.", "error");
        return;
      }
      try {
        await request({ type: "SAVE_SETTINGS", settings: { apiBaseUrl, usePolicyService: isChecked(form, "usePolicyService") } });
        toast("Connection settings saved.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
  }
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "s") {
      event.preventDefault();
      toast("Use the Save buttons in each section.");
    }
  });
  async function boot() {
    await refresh();
    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!target.matches("#start-discovery")) return;
      const campaign = selectedCampaign();
      if (!campaign) return;
      try {
        let tabId = sourceTabId;
        if (!tabId) {
          const tabs = await chrome.tabs.query({ url: ["https://www.pracuj.pl/*", "https://pracuj.pl/*", "https://*.pracuj.pl/*"] });
          tabId = tabs[0]?.id ?? null;
        }
        if (!tabId) throw new Error("Open a filtered Pracuj.pl search-results tab before starting discovery.");
        await request({ type: "START_DISCOVERY", campaignId: campaign.id, sourceTabId: tabId });
        toast("Safe 50-job discovery started. No applications will be submitted.");
        await refresh();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), "error");
      }
    });
  }
  void boot().catch((error) => {
    root.innerHTML = `<div class="shell"><div class="notice danger">${escapeHtml(error instanceof Error ? error.message : String(error))}</div></div>`;
  });
})();
//# sourceMappingURL=dashboard.js.map
