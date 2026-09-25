"use strict";
(() => {
  // src/shared/text.ts
  function normalize(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }
  function labelToCanonicalKey(label, inputName = "") {
    const text = normalize(`${label} ${inputName}`);
    const has = (...needles) => needles.some((needle) => text.includes(needle));
    if (has("first name", "imie")) return "first_name";
    if (has("last name", "surname", "nazwisko")) return "last_name";
    if (has("full name", "name and surname", "imie nazwisko")) return "full_name";
    if (has("email", "e mail")) return "email";
    if (has("phone", "telephone", "telefon")) return "phone";
    if (has("city", "location", "miasto", "lokalizacja")) return "city";
    if (has("linkedin")) return "linkedin_url";
    if (has("portfolio", "github", "website", "web site")) return "portfolio_url";
    if (has("notice period", "availability", "start date", "okres wypowiedzenia", "dyspozycyjn")) return "notice_period";
    if (has("salary", "compensation", "remuneration", "wynagrodzenie", "financial expectation")) return "salary_expectation";
    if (has("work authorization", "right to work", "visa", "permit", "zezwolenie")) return "work_authorization";
    if (has("english", "angielski")) return "english_level";
    if (has("experience", "doswiadczenie")) return "years_experience";
    if (has("cv", "resume", "zyciorys")) return "cv";
    if (has("consent", "zgoda", "rodo", "data processing")) return "data_processing_consent";
    return text.replace(/\s+/g, "_").slice(0, 80) || "unknown";
  }
  function isSensitiveLabel(label) {
    const text = normalize(label);
    return ["gender", "disability", "criminal", "conviction", "ethnicity", "race", "religion", "health", "citizenship", "date of birth", "pesel", "nationality"].some((word) => text.includes(word));
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

  // src/content/pracuj-adapter.ts
  var APPLY_TEXT = /(?:^|\s)(aplikuj|apply)(?:\s|$)/i;
  var EXTERNAL_TEXT = /zewn[eę]trzn|external|stronie pracodawcy/i;
  var CONFIRMATION_TEXT = /aplikacja.{0,40}(wysłana|została wysłana|sent|submitted)|dziękujemy.{0,80}(aplik|zgłoszen)|thank.{0,80}(application|apply)/i;
  var CAPTCHA_TEXT = /captcha|recaptcha|hcaptcha|i.?m not a robot/i;
  var VERIFICATION_TEXT = /verify (your )?(email|phone)|potwierdź (email|adres|numer)|kod (sms|weryfikacyjny)/i;
  function isPracujHost(hostname) {
    const host = hostname.toLowerCase();
    return host === "pracuj.pl" || host.endsWith(".pracuj.pl");
  }
  function textOf(element) {
    return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
  }
  function firstText(selectors) {
    for (const selector of selectors) {
      const value = textOf(document.querySelector(selector));
      if (value) return value;
    }
    return "";
  }
  function closestCard(anchor) {
    return anchor.closest('article, li, [data-test*="offer"], [data-test*="job"], div') ?? anchor;
  }
  function uniqueSelector(element) {
    const html = element;
    if (html.id) return `#${CSS.escape(html.id)}`;
    const name = html.getAttribute("name");
    if (name) return `${html.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
    const testId = html.getAttribute("data-test");
    if (testId) return `[data-test="${CSS.escape(testId)}"]`;
    const inputType = html.getAttribute("type");
    if (inputType) return `${html.tagName.toLowerCase()}[type="${CSS.escape(inputType)}"]`;
    return html.tagName.toLowerCase();
  }
  function labelForControl(control) {
    const id = control.id;
    if (id) {
      const direct = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (textOf(direct)) return textOf(direct);
    }
    const wrappingLabel = control.closest("label");
    if (textOf(wrappingLabel)) return textOf(wrappingLabel);
    const labelledBy = control.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((part) => textOf(document.getElementById(part))).filter(Boolean).join(" ");
      if (text) return text;
    }
    return control.getAttribute("aria-label") || control.getAttribute("placeholder") || control.getAttribute("name") || control.id || "Unlabelled field";
  }
  function inputKind(control) {
    if (control instanceof HTMLTextAreaElement) return "textarea";
    if (control instanceof HTMLSelectElement) return "select";
    switch (control.type) {
      case "text":
      case "password":
      case "date":
      case "url":
        return "text";
      case "email":
        return "email";
      case "tel":
        return "tel";
      case "number":
        return "number";
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      case "file":
        return "file";
      default:
        return "unknown";
    }
  }
  function optionsFor(control) {
    if (control instanceof HTMLSelectElement) return Array.from(control.options).map((option) => option.text.trim()).filter(Boolean);
    if (control instanceof HTMLInputElement && control.type === "radio" && control.name) {
      return Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(control.name)}"]`)).map((radio) => labelForControl(radio)).filter(Boolean);
    }
    return [];
  }
  var PracujAdapter = class {
    searchResults() {
      const candidates = Array.from(document.querySelectorAll('a[href*="oferta"], a[href*="/praca/"]'));
      const seen = /* @__PURE__ */ new Set();
      const results = [];
      for (const anchor of candidates) {
        const url = new URL(anchor.href, window.location.href).toString();
        if (seen.has(url) || !/pracuj\.pl/.test(new URL(url).hostname)) continue;
        const title = textOf(anchor) || anchor.getAttribute("aria-label") || "";
        if (!title || title.length > 180) continue;
        const card = closestCard(anchor);
        const cardText = textOf(card);
        const company = firstTextFrom(card, ['[data-test*="company"]', '[class*="company"]']) || "";
        const cardLocation = firstTextFrom(card, ['[data-test*="location"]', '[class*="location"]']) || "";
        seen.add(url);
        results.push({ url, title, company: company || extractSecondaryLine(cardText, title), location: cardLocation });
      }
      return results;
    }
    extractJob() {
      const title = firstText(["h1", '[data-test*="job-title"]', '[data-test*="offer-title"]']) || document.title.replace(/\s*[-|].*$/, "");
      const company = firstText(['[data-test*="company"]', '[class*="company"]', 'a[href*="pracodawca"]']);
      const locationText = firstText(['[data-test*="location"]', '[class*="location"]']);
      const salaryText = firstText(['[data-test*="salary"]', '[class*="salary"]']);
      const publishedText = firstText(['[data-test*="published"]', "time"]);
      const descriptionRoot = document.querySelector("main") ?? document.body;
      const description = textOf(descriptionRoot).slice(0, 25e3);
      const { kind, applicationUrl } = this.classifyApplication();
      const flags = [];
      if (CAPTCHA_TEXT.test(description)) flags.push("captcha");
      if (VERIFICATION_TEXT.test(description)) flags.push("verification");
      return { url: locationHref(), title, company, location: locationText, salaryText, description, publishedText, applicationKind: kind, applicationUrl, flags };
    }
    classifyApplication() {
      const action = this.findApplyControl();
      if (!action) return this.findApplicationFormRoot() ? { kind: "INTERNAL", applicationUrl: locationHref() } : { kind: "UNKNOWN", applicationUrl: "" };
      if (action instanceof HTMLAnchorElement && action.href) {
        const target = new URL(action.href, location.href);
        return { kind: isPracujHost(target.hostname) ? "INTERNAL" : "EXTERNAL", applicationUrl: target.toString() };
      }
      const surroundingText = textOf(action.parentElement).slice(0, 300);
      return { kind: EXTERNAL_TEXT.test(surroundingText) ? "EXTERNAL" : "INTERNAL", applicationUrl: locationHref() };
    }
    findApplyControl() {
      const isFinalSubmit = (element) => {
        if (element instanceof HTMLButtonElement) return element.type === "submit" || Boolean(element.closest("form"));
        if (element instanceof HTMLInputElement) return element.type === "submit";
        return false;
      };
      const explicit = Array.from(document.querySelectorAll('[data-test*="apply"], [data-test*="application"], a[href*="apply"]'));
      const textCandidates = Array.from(document.querySelectorAll("a, button"));
      return explicit.find((element) => APPLY_TEXT.test(textOf(element)) && !isFinalSubmit(element)) ?? textCandidates.find((element) => APPLY_TEXT.test(textOf(element)) && !isFinalSubmit(element)) ?? null;
    }
    inspectCurrentForm(jobId) {
      const root = this.findApplicationFormRoot();
      if (!root) return null;
      const controls = Array.from(root.querySelectorAll('input:not([type="hidden"]), textarea, select'));
      if (!controls.length) return null;
      const fields = [];
      const seenRadioNames = /* @__PURE__ */ new Set();
      for (const control of controls) {
        const kind = inputKind(control);
        if (kind === "radio" && control instanceof HTMLInputElement && control.name) {
          if (seenRadioNames.has(control.name)) continue;
          seenRadioNames.add(control.name);
        }
        const label = labelForControl(control);
        const field = {
          id: control.id || control.getAttribute("name") || `${kind}_${fields.length}`,
          label,
          canonicalKey: labelToCanonicalKey(label, control.getAttribute("name") || ""),
          required: control.required || control.getAttribute("aria-required") === "true" || /\*/.test(label),
          inputKind: kind,
          options: optionsFor(control),
          isSensitive: isSensitiveLabel(label),
          selector: uniqueSelector(control),
          validationHint: control.getAttribute("pattern") || control.getAttribute("autocomplete") || ""
        };
        fields.push(field);
      }
      const text = textOf(root);
      const submit = Array.from(root.querySelectorAll('button, input[type="submit"]')).find((element) => /submit|send|apply|wyślij|aplikuj/i.test(textOf(element) || element.value || ""));
      return {
        jobId,
        applicationKind: "INTERNAL",
        fields,
        hasSubmitControl: Boolean(submit),
        submitSelector: submit ? uniqueSelector(submit) : "",
        hasCaptcha: CAPTCHA_TEXT.test(text),
        hasVerification: VERIFICATION_TEXT.test(text),
        observedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
    }
    findApplicationFormRoot() {
      const dialog = document.querySelector('[role="dialog"], [aria-modal="true"], [data-test*="application"]');
      const candidates = [];
      if (dialog) candidates.push(dialog);
      candidates.push(...Array.from(document.querySelectorAll("form")));
      let winner = null;
      let winningScore = 0;
      for (const candidate of candidates) {
        const controls = candidate.querySelectorAll('input:not([type="hidden"]), textarea, select');
        if (!controls.length) continue;
        const text = textOf(candidate);
        let score = 0;
        if (candidate === dialog || candidate.closest('[role="dialog"], [aria-modal="true"]')) score += 12;
        if (candidate.querySelector('input[type="file"]')) score += 8;
        if (/application|aplikacj|apply|wy[sś]lij|zgłoszen/i.test(text)) score += 6;
        const labels = Array.from(controls).map((control) => labelForControl(control)).join(" ");
        if (/email|e-mail|phone|telefon|cv|resume|consent|zgoda|rodo|first name|imie|nazwisko/i.test(labels)) score += 5;
        if (score > winningScore) {
          winner = candidate;
          winningScore = score;
        }
      }
      return winningScore >= 5 ? winner : null;
    }
    async openInternalForm() {
      const existing = this.inspectCurrentForm("__probe__");
      if (existing) return { opened: true, reason: "Application form already present." };
      const action = this.findApplyControl();
      if (!action) return { opened: false, reason: "Apply control was not found." };
      const { kind } = this.classifyApplication();
      if (kind !== "INTERNAL") return { opened: false, reason: "External application flows are intentionally not opened." };
      if (action instanceof HTMLButtonElement && action.type === "submit") return { opened: false, reason: "Refused to click a submit button during safe form inspection." };
      action.click();
      const formAppeared = await waitFor(() => Boolean(this.inspectCurrentForm("__probe__")), 5e3);
      return { opened: formAppeared, reason: formAppeared ? "Internal form opened for non-submitting inspection." : "No form appeared after opening the internal application control." };
    }
    confirmationText() {
      const page = textOf(document.body);
      const match = page.match(CONFIRMATION_TEXT);
      return match ? match[0] : "";
    }
  };
  function firstTextFrom(root, selectors) {
    for (const selector of selectors) {
      const value = textOf(root.querySelector(selector));
      if (value) return value;
    }
    return "";
  }
  function extractSecondaryLine(cardText, title) {
    const lines = cardText.split(/\s{2,}|\n/).map((item) => item.trim()).filter(Boolean);
    return lines.find((line) => normalize(line) !== normalize(title)) || "";
  }
  function locationHref() {
    return location.href;
  }
  async function waitFor(predicate, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (predicate()) return true;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return false;
  }

  // src/content/form-filler.ts
  function dispatchInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function setTextValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    dispatchInputEvents(element);
  }
  function controlsFor(field) {
    try {
      const exact = Array.from(document.querySelectorAll(field.selector));
      if (exact.length) return exact;
    } catch {
    }
    return Array.from(document.querySelectorAll("input, textarea, select")).filter((control) => normalize(control.getAttribute("name") || control.id || "") === field.canonicalKey);
  }
  function selectOption(control, value) {
    const desired = normalize(value);
    const option = Array.from(control.options).find((item) => normalize(item.text).includes(desired) || desired.includes(normalize(item.text)));
    if (!option) return false;
    control.value = option.value;
    dispatchInputEvents(control);
    return true;
  }
  function fillRadio(controls, value) {
    const desired = normalize(value);
    const candidate = controls.find((control) => {
      const label = control.id ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)?.textContent ?? "" : "";
      return normalize(`${label} ${control.value}`).includes(desired);
    });
    if (!candidate) return false;
    if (!candidate.checked) candidate.click();
    return candidate.checked;
  }
  function readBackMatches(field, controls, value) {
    if (field.inputKind === "checkbox") return controls.some((control) => control instanceof HTMLInputElement && control.checked === value);
    if (field.inputKind === "radio") return controls.some((control) => control instanceof HTMLInputElement && control.checked);
    if (field.inputKind === "select") return controls.some((control) => control instanceof HTMLSelectElement && Boolean(control.value));
    return controls.some((control) => "value" in control && normalize(String(control.value)).includes(normalize(String(value))));
  }
  function submitControl(schema) {
    if (schema.submitSelector) {
      try {
        const control = document.querySelector(schema.submitSelector);
        if (control) return control;
      } catch {
      }
    }
    return Array.from(document.querySelectorAll('button, input[type="submit"]')).find((control) => /submit|send|apply|wyślij|aplikuj/i.test(control.textContent || control.value || "")) ?? null;
  }
  async function fillAndMaybeSubmit(adapter2, schema, profile, authorizeSubmit) {
    const filledKeys = [];
    const missingFields = [];
    if (schema.hasCaptcha || schema.hasVerification) {
      return { status: "NEEDS_REVIEW", message: "Captcha or verification step detected. Automation paused.", filledKeys, missingFields, confirmationText: "" };
    }
    for (const field of schema.fields) {
      const value = profileValueForField(profile, field);
      const controls = controlsFor(field);
      if (field.isSensitive && field.required) {
        missingFields.push(`${field.label} (sensitive; review required)`);
        continue;
      }
      if (field.inputKind === "file") {
        if (field.required && controls.some((control) => control instanceof HTMLInputElement && !control.value)) {
          missingFields.push(`${field.label} (file selection requires review)`);
        }
        continue;
      }
      if (value === null || value === "") {
        if (field.required) missingFields.push(field.label);
        continue;
      }
      if (!controls.length) {
        if (field.required) missingFields.push(`${field.label} (field changed or unavailable)`);
        continue;
      }
      let filled = false;
      if (field.inputKind === "checkbox") {
        const desired = value === true;
        const checkbox = controls.find((control) => control instanceof HTMLInputElement && control.type === "checkbox");
        if (checkbox && desired && !checkbox.checked) checkbox.click();
        filled = checkbox ? desired ? checkbox.checked : true : false;
      } else if (field.inputKind === "radio") {
        filled = fillRadio(controls.filter((control) => control instanceof HTMLInputElement), String(value));
      } else if (field.inputKind === "select") {
        const select = controls.find((control) => control instanceof HTMLSelectElement);
        filled = select ? selectOption(select, String(value)) : false;
      } else {
        const control = controls.find((item) => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement);
        if (control) {
          setTextValue(control, String(value));
          filled = true;
        }
      }
      if (!filled || !readBackMatches(field, controls, value)) {
        if (field.required) missingFields.push(`${field.label} (could not validate value)`);
        continue;
      }
      filledKeys.push(field.canonicalKey);
    }
    if (missingFields.length) {
      return { status: "NEEDS_REVIEW", message: "Form was not submitted because required answers need review.", filledKeys, missingFields, confirmationText: "" };
    }
    if (!authorizeSubmit) {
      return { status: "READY", message: "Form is complete and validated. Review mode is active.", filledKeys, missingFields, confirmationText: "" };
    }
    if (!schema.hasSubmitControl) {
      return { status: "NEEDS_REVIEW", message: "No reliable submit control was detected.", filledKeys, missingFields, confirmationText: "" };
    }
    const submit = submitControl(schema);
    if (!submit || submit.matches(':disabled,[aria-disabled="true"]')) {
      return { status: "NEEDS_REVIEW", message: "Submit control is unavailable or disabled.", filledKeys, missingFields, confirmationText: "" };
    }
    submit.click();
    await waitFor(() => Boolean(adapter2.confirmationText()), 3500);
    const confirmationText = adapter2.confirmationText();
    if (confirmationText) {
      return { status: "SUBMITTED", message: "Submission confirmed on the page.", filledKeys, missingFields, confirmationText };
    }
    return {
      status: "NEEDS_REVIEW",
      message: "Submit was triggered, but a confirmation could not be verified. The run is paused to prevent duplicates.",
      filledKeys,
      missingFields,
      confirmationText: ""
    };
  }

  // src/content/index.ts
  var adapter = new PracujAdapter();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case "GET_SEARCH_RESULTS": {
            const items = adapter.searchResults();
            sendResponse({ ok: true, items });
            break;
          }
          case "AUDIT_CURRENT_JOB": {
            const initialJob = adapter.extractJob();
            if (initialJob.applicationKind === "EXTERNAL") {
              sendResponse({ ok: true, job: initialJob, form: null, note: "External applications are logged and skipped in v1." });
              break;
            }
            if (message.openApplication && initialJob.applicationKind === "INTERNAL") await adapter.openInternalForm();
            const form = adapter.inspectCurrentForm(message.jobId);
            const pageJob = adapter.extractJob();
            const job = { ...pageJob, applicationKind: initialJob.applicationKind, applicationUrl: initialJob.applicationUrl || pageJob.applicationUrl };
            sendResponse({ ok: true, job, form });
            break;
          }
          case "PREPARE_CURRENT_APPLICATION": {
            const initialJob = adapter.extractJob();
            let job = initialJob;
            if (job.applicationKind !== "INTERNAL") {
              sendResponse({ ok: true, job, form: null, result: { status: "SKIPPED", message: "External or unknown application flow.", filledKeys: [], missingFields: [], confirmationText: "" } });
              break;
            }
            let form = adapter.inspectCurrentForm(message.jobId);
            if (!form) {
              await adapter.openInternalForm();
              const pageJob = adapter.extractJob();
              job = { ...pageJob, applicationKind: initialJob.applicationKind, applicationUrl: initialJob.applicationUrl || pageJob.applicationUrl };
              form = adapter.inspectCurrentForm(message.jobId);
            }
            if (!form) {
              sendResponse({ ok: true, job, form: null, result: { status: "NEEDS_REVIEW", message: "Internal form could not be safely inspected.", filledKeys: [], missingFields: [], confirmationText: "" } });
              break;
            }
            const result = await fillAndMaybeSubmit(adapter, form, message.profile, message.authorizeSubmit);
            sendResponse({ ok: true, job, form, result });
            break;
          }
          case "VERIFY_SUBMISSION": {
            const confirmationText = adapter.confirmationText();
            sendResponse({ ok: true, confirmationText });
            break;
          }
          default:
            sendResponse({ ok: false, error: "Unsupported content message." });
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error("ApplyPilot content failure", error);
        sendResponse({ ok: false, error: messageText });
      }
    })();
    return true;
  });
})();
//# sourceMappingURL=content.js.map
