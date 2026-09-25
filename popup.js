"use strict";
(() => {
  // src/ui/popup/main.ts
  function getRoot() {
    const element = document.querySelector("#app");
    if (!element) throw new Error("Missing popup root.");
    return element;
  }
  var root = getRoot();
  function phaseLabel(phase) {
    return phase.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  async function request(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Extension request failed.");
    return response.data;
  }
  function render(state) {
    const campaign = state.campaigns.find((item) => item.id === state.run.campaignId) ?? state.campaigns[0];
    const completed = state.applications.filter((item) => item.status === "SUBMITTED").length;
    const isRunning = ["DISCOVERING", "RUNNING", "STOP_REQUESTED"].includes(state.run.phase);
    root.innerHTML = `
    <section class="brand"><div class="brand-mark">A</div><div><h1>ApplyPilot</h1><p>One application at a time.</p></div></section>
    <section class="card">
      <div class="label">${campaign ? escapeHtml(campaign.name) : "No campaign selected"}</div>
      <div class="metric">${phaseLabel(state.run.phase)}</div>
      <div class="small">${escapeHtml(state.run.message)}</div>
      <div class="rule"></div>
      <div class="row"><div><div class="label">Submitted</div><b>${completed}</b></div><div><div class="label">Queued</div><b>${Math.max(0, state.run.queueJobIds.length - state.run.cursor)}</b></div><div><div class="label">Audited</div><b>${state.jobs.filter((job) => job.campaignId === campaign?.id).length}</b></div></div>
    </section>
    <div class="actions">
      <button id="open-dashboard" class="button">Open dashboard</button>
      ${isRunning ? '<button id="stop-run" class="button danger">Stop safely</button>' : ""}
    </div>
    <p class="footer-note">The agent stops for unknown questions, verification and unconfirmed submissions.</p>`;
    document.querySelector("#open-dashboard")?.addEventListener("click", async () => {
      await request({ type: "OPEN_DASHBOARD" });
      window.close();
    });
    document.querySelector("#stop-run")?.addEventListener("click", async () => {
      await request({ type: "STOP_RUN" });
      await boot();
    });
  }
  function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
  }
  async function boot() {
    try {
      render(await request({ type: "GET_STATE" }));
    } catch (error) {
      root.innerHTML = `<p class="notice danger">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  }
  void boot();
})();
//# sourceMappingURL=popup.js.map
