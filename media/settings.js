// ActionsBoard-Duo settings form. One screen, Apply model: everything is
// edited locally in this page and written only when Save is pressed.
(function () {
  const vscode = acquireVsCodeApi();
  const S = window.ABD_STRINGS;
  const app = document.getElementById("app");

  let state = null; // { config, settings, hasToken, logins }
  let tokens = {}; // accountId -> typed token (session only)
  let removedAccountIds = [];
  let discovered = {}; // groupId -> [{ name, file }]
  let requestSeq = 0;
  const pending = {}; // requestId -> callback

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "class") el.className = v;
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
        else if (k === "checked" || k === "selected") el[k] = v;
        else el.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined) continue;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  function textInput(value, oninput, attrs) {
    const input = h("input", Object.assign({ type: "text", value: value ?? "" }, attrs || {}));
    input.addEventListener("input", () => oninput(input.value));
    return input;
  }

  function labeled(text, control) {
    return h("label", null, text, control);
  }

  // ---------- Accounts ----------

  function accountDisplayName(account) {
    return account.name && account.name.trim() !== "" ? account.name : S.unnamedAccount;
  }

  function accountCard(account) {
    const heading = h("h3", { class: "card-title" }, accountDisplayName(account));
    const nameInput = textInput(account.name, (v) => {
      account.name = v;
      heading.textContent = accountDisplayName(account);
    });
    const resultSpan = h("span", { id: `test-result-${account.id}` });
    const tokenInput = h("input", {
      type: "password",
      placeholder: state.hasToken[account.id] ? S.tokenKept : S.tokenNew,
      autocomplete: "off",
    });
    tokenInput.addEventListener("input", () => {
      tokens[account.id] = tokenInput.value;
    });
    const testBtn = h(
      "button",
      {
        onclick: () => {
          const requestId = `test-${++requestSeq}`;
          resultSpan.textContent = S.testing;
          resultSpan.className = "";
          pending[requestId] = (msg) => {
            resultSpan.textContent = msg.message;
            resultSpan.className = msg.ok ? "result-ok" : "result-ng";
          };
          vscode.postMessage({
            type: "test",
            requestId,
            accountId: account.id,
            baseUrl: account.baseUrl,
            token: tokens[account.id] || "",
          });
        },
      },
      S.test,
    );
    const removeBtn = h(
      "button",
      {
        class: "danger",
        onclick: () => {
          state.config.accounts = state.config.accounts.filter((a) => a.id !== account.id);
          removedAccountIds.push(account.id);
          render();
        },
      },
      S.remove,
    );
    const loginInfo = state.logins[account.id] ? h("span", { class: "hint" }, `@${state.logins[account.id]}`) : null;
    return h(
      "div",
      { class: "card" },
      heading,
      h(
        "div",
        { class: "row" },
        labeled(S.accountName, nameInput),
        labeled(S.baseUrl, textInput(account.baseUrl, (v) => (account.baseUrl = v))),
        removeBtn,
      ),
      h("div", { class: "hint" }, S.baseUrlHint),
      h("div", { class: "row" }, labeled(S.token, tokenInput), testBtn, resultSpan, loginInfo),
    );
  }

  // ---------- Groups & workflows ----------

  function workflowRow(group, w) {
    const star = h("input", { type: "checkbox", checked: w.starred === true });
    star.addEventListener("change", () => (w.starred = star.checked));
    return h(
      "tr",
      null,
      h("td", null, `${w.owner}/${w.repo}`),
      h("td", null, w.workflow),
      h("td", { class: "star" }, star),
      h(
        "td",
        null,
        h(
          "button",
          {
            class: "danger",
            onclick: () => {
              group.workflows = group.workflows.filter((x) => x !== w);
              render();
            },
          },
          S.remove,
        ),
      ),
    );
  }

  function addBox(group) {
    const account = state.config.accounts.find((a) => a.id === group.accountId);
    // Discovery
    const dOwner = h("input", { type: "text", placeholder: S.owner });
    const dRepo = h("input", { type: "text", placeholder: S.repo });
    const dList = h("div", { class: "checklist" });
    const listBtn = h(
      "button",
      {
        onclick: () => {
          const owner = dOwner.value.trim();
          const repo = dRepo.value.trim();
          if (!owner || !repo) {
            dList.replaceChildren(h("span", { class: "result-ng" }, S.discoverNeedsRepo));
            return;
          }
          const requestId = `discover-${++requestSeq}`;
          pending[requestId] = (msg) => {
            if (msg.error) {
              dList.replaceChildren(h("span", { class: "result-ng" }, msg.error));
              return;
            }
            discovered[group.id] = msg.workflows;
            renderDiscovered(group, dList, owner, repo);
          };
          vscode.postMessage({
            type: "discover",
            requestId,
            groupId: group.id,
            accountId: group.accountId,
            baseUrl: account ? account.baseUrl : "",
            token: tokens[group.accountId] || "",
            owner,
            repo,
          });
        },
      },
      S.listWorkflows,
    );
    return h(
      "div",
      { class: "addbox" },
      h("h3", { class: "addbox-title" }, S.addByDiscovery),
      h("div", { class: "row" }, dOwner, dRepo, listBtn),
      dList,
    );
  }

  function renderDiscovered(group, container, owner, repo) {
    const items = discovered[group.id] || [];
    const checks = items.map((wf) => {
      const cb = h("input", { type: "checkbox", checked: true });
      // Label display only (what is saved stays the file): the workflow
      // name when the workflow has one of its own, otherwise the file
      // name. The payload's name falls back to the file name (or path)
      // when the workflow file declares no name, so treat those as
      // "no name" instead of printing the file twice.
      const hasOwnName =
        typeof wf.name === "string" && wf.name !== "" && wf.name !== wf.file && !wf.name.endsWith(`/${wf.file}`);
      const label = hasOwnName ? `${wf.name} (${wf.file})` : wf.file;
      return { wf, cb, row: h("label", { class: "inline" }, cb, label) };
    });
    const addBtn = h(
      "button",
      {
        onclick: () => {
          for (const { wf, cb } of checks) {
            if (cb.checked) {
              group.workflows.push({ owner, repo, workflow: wf.file });
            }
          }
          render();
        },
      },
      S.addSelected,
    );
    container.replaceChildren(...checks.map((c) => c.row), addBtn);
  }

  function groupCard(group) {
    const accountSelect = h("select", null);
    for (const a of state.config.accounts) {
      const opt = h("option", { value: a.id, selected: a.id === group.accountId }, a.name);
      accountSelect.appendChild(opt);
    }
    accountSelect.addEventListener("change", () => (group.accountId = accountSelect.value));
    const table =
      group.workflows.length === 0
        ? h("div", { class: "empty" }, S.noWorkflows)
        : h(
            "table",
            { class: "workflows" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, S.repository),
                h("th", null, S.workflowFile),
                h("th", null, S.starred),
                h("th", null, ""),
              ),
            ),
            h("tbody", null, group.workflows.map((w) => workflowRow(group, w))),
          );
    return h(
      "div",
      { class: "card" },
      h(
        "div",
        { class: "row" },
        labeled(S.groupName, textInput(group.name, (v) => (group.name = v))),
        labeled(S.groupAccount, accountSelect),
        h(
          "button",
          {
            class: "danger",
            onclick: () => {
              state.config.groups = state.config.groups.filter((g) => g.id !== group.id);
              render();
            },
          },
          S.remove,
        ),
      ),
      h("h3", null, S.workflows),
      table,
      addBox(group),
    );
  }

  // ---------- Whole form ----------

  function numberSetting(label, value, apply) {
    const input = h("input", { type: "number", value: String(value), min: "10" });
    input.addEventListener("input", () => {
      const n = Number(input.value);
      if (Number.isFinite(n) && n > 0) apply(n);
    });
    return labeled(label, input);
  }

  function checkSetting(label, value, apply) {
    const input = h("input", { type: "checkbox", checked: value === true });
    input.addEventListener("change", () => apply(input.checked));
    return h("label", { class: "inline" }, input, label);
  }

  function render() {
    if (!state) return;
    const { config, settings } = state;
    const scopeSelect = h("select", null);
    for (const [value, label] of [
      ["all", S.scopeAll],
      ["mine", S.scopeMine],
      ["starred", S.scopeStarred],
    ]) {
      scopeSelect.appendChild(h("option", { value, selected: settings.notificationScope === value }, label));
    }
    scopeSelect.addEventListener("change", () => (settings.notificationScope = scopeSelect.value));

    app.replaceChildren(
      h("h2", null, S.accounts),
      ...(config.accounts.length === 0 ? [h("div", { class: "empty" }, S.noAccounts)] : config.accounts.map(accountCard)),
      h(
        "button",
        {
          onclick: () => {
            config.accounts.push({ id: uid(), name: "", baseUrl: "https://api.github.com" });
            render();
          },
        },
        S.addAccount,
      ),
      h("h2", null, S.groups),
      ...(config.groups.length === 0 ? [h("div", { class: "empty" }, S.noGroups)] : config.groups.map(groupCard)),
      h(
        "button",
        {
          onclick: () => {
            if (config.accounts.length === 0) return;
            config.groups.push({ id: uid(), name: "", accountId: config.accounts[0].id, workflows: [] });
            render();
          },
        },
        S.addGroup,
      ),
      h("h2", null, S.polling),
      h(
        "div",
        { class: "row" },
        numberSetting(S.pollVisible, settings.pollVisibleSec, (n) => (settings.pollVisibleSec = n)),
        numberSetting(S.pollHidden, settings.pollHiddenSec, (n) => (settings.pollHiddenSec = n)),
        numberSetting(S.liveness, settings.livenessSec, (n) => (settings.livenessSec = n)),
      ),
      h("h2", null, S.notifications),
      h(
        "div",
        { class: "row" },
        checkSetting(S.notifyFailure, settings.notifyOnFailure, (v) => (settings.notifyOnFailure = v)),
        checkSetting(S.notifyOutage, settings.notifyOnOutage, (v) => (settings.notifyOnOutage = v)),
        checkSetting(S.notifyRecovery, settings.notifyOnRecovery, (v) => (settings.notifyOnRecovery = v)),
      ),
      h("div", { class: "row" }, labeled(S.notifyScope, scopeSelect)),
      h("h2", null, S.legend),
      h("ul", { class: "legend" }, h("li", null, S.legendStar), h("li", null, S.legendMine), h("li", null, S.legendStatus)),
    );
  }

  const saveBtn = document.getElementById("save");
  const cancelBtn = document.getElementById("cancel");
  const saveStatus = document.getElementById("save-status");
  saveBtn.textContent = S.save;
  cancelBtn.textContent = S.cancel;
  cancelBtn.addEventListener("click", () => {
    // Ask the extension to re-send the saved state; the init handler below
    // rebuilds the whole form from it, discarding every unsaved edit.
    saveStatus.textContent = "";
    vscode.postMessage({ type: "cancel" });
  });
  saveBtn.addEventListener("click", () => {
    if (!state) return;
    vscode.postMessage({
      type: "save",
      config: JSON.parse(JSON.stringify(state.config)),
      settings: state.settings,
      tokens,
      removedAccountIds,
    });
    removedAccountIds = [];
    saveStatus.textContent = S.saved;
    setTimeout(() => (saveStatus.textContent = ""), 3000);
  });

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (msg.type === "init") {
      state = msg.payload;
      tokens = {};
      removedAccountIds = [];
      discovered = {};
      render();
    } else if (msg.type === "testResult" || msg.type === "discovered") {
      const cb = pending[msg.requestId];
      if (cb) {
        delete pending[msg.requestId];
        cb(msg);
      }
    }
  });

  vscode.postMessage({ type: "ready" });
})();
