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
  let discoveredPlans = {}; // groupId -> [{ projectKey, projectName, planKey, name }]
  let discoveryGroupId = null; // destination group of the shared discovery panel
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

  // Trash-can icon for the remove buttons. Inline SVG (the webview has no
  // codicon font); the strokes follow the button's colour, which .danger
  // sets to the error red. The accessible name stays the remove string.
  const TRASH_SVG =
    '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M2.2 3.8h11.6"/>' +
    '<path d="M6.3 3.8V2.6c0-.5.4-.9.9-.9h1.6c.5 0 .9.4.9.9v1.2"/>' +
    '<path d="M4 3.8l.7 8.9c.1.9.8 1.6 1.7 1.6h3.2c.9 0 1.6-.7 1.7-1.6l.7-8.9"/>' +
    '<path d="M6.6 6.4v4.8"/>' +
    '<path d="M9.4 6.4v4.8"/>' +
    "</svg>";

  function removeButton(onclick) {
    const icon = h("span", { class: "btn-icon" });
    icon.innerHTML = TRASH_SVG;
    return h("button", { class: "danger icon-btn", title: S.remove, "aria-label": S.remove, onclick }, icon);
  }

  // ---------- Accounts ----------

  function accountKindOf(account) {
    return account && account.kind === "bamboo" ? "bamboo" : "github";
  }

  function groupKind(group) {
    return accountKindOf(state.config.accounts.find((a) => a.id === group.accountId));
  }

  function accountDisplayName(account) {
    return account.name && account.name.trim() !== "" ? account.name : S.unnamedAccount;
  }

  function accountCard(account) {
    const kind = accountKindOf(account);
    const heading = h("h3", { class: "card-title" }, accountDisplayName(account));
    const nameInput = textInput(account.name, (v) => {
      account.name = v;
      heading.textContent = accountDisplayName(account);
    });
    const kindSelect = h("select", null);
    for (const [value, label] of [
      ["github", S.kindGitHub],
      ["bamboo", S.kindBamboo],
    ]) {
      kindSelect.appendChild(h("option", { value, selected: kind === value }, label));
    }
    kindSelect.addEventListener("change", () => {
      account.kind = kindSelect.value;
      // Keep the URL plausible for the newly chosen service: clear the
      // GitHub default when switching to Bamboo, restore it when
      // switching back to GitHub with an empty URL.
      if (account.kind === "bamboo" && account.baseUrl === "https://api.github.com") {
        account.baseUrl = "";
      } else if (account.kind === "github" && (!account.baseUrl || account.baseUrl.trim() === "")) {
        account.baseUrl = "https://api.github.com";
      }
      render();
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
            kind,
            token: tokens[account.id] || "",
          });
        },
      },
      S.test,
    );
    const removeBtn = removeButton(() => {
      state.config.accounts = state.config.accounts.filter((a) => a.id !== account.id);
      removedAccountIds.push(account.id);
      render();
    });
    const loginInfo = state.logins[account.id] ? h("span", { class: "hint" }, `@${state.logins[account.id]}`) : null;
    return h(
      "div",
      { class: "card" },
      heading,
      h(
        "div",
        { class: "row" },
        labeled(S.accountName, nameInput),
        labeled(S.kind, kindSelect),
        removeBtn,
      ),
      h(
        "div",
        { class: "row" },
        labeled(
          kind === "bamboo" ? S.baseUrlBamboo : S.baseUrl,
          textInput(account.baseUrl, (v) => (account.baseUrl = v)),
        ),
      ),
      h("div", { class: "hint" }, kind === "bamboo" ? S.baseUrlBambooHint : S.baseUrlHint),
      h("div", { class: "row" }, labeled(S.token, tokenInput), testBtn, resultSpan, loginInfo),
    );
  }

  // ---------- Groups & workflows ----------

  function workflowRow(group, w) {
    const star = h("input", { type: "checkbox", checked: w.starred === true });
    star.addEventListener("change", () => (w.starred = star.checked));
    // Entry shape follows the group's account kind: plans show
    // project key + plan key, workflows show owner/repo + file.
    const isPlan = w.planKey !== undefined;
    return h(
      "tr",
      null,
      h("td", null, isPlan ? w.projectKey : `${w.owner}/${w.repo}`),
      h("td", null, isPlan ? w.planKey : w.workflow),
      h("td", { class: "star" }, star),
      h(
        "td",
        null,
        removeButton(() => {
          group.workflows = group.workflows.filter((x) => x !== w);
          render();
        }),
      ),
    );
  }

  // ---------- Shared discovery panel ----------
  // One panel for the whole form, after the groups section — not one
  // per group. A destination selector picks the group the ticked items
  // land in (hidden when there is only one group), and the panel's
  // contents follow that group's account kind.

  function discoveryGroup() {
    const groups = state.config.groups;
    if (groups.length === 0) {
      return null;
    }
    if (!groups.some((g) => g.id === discoveryGroupId)) {
      discoveryGroupId = groups[0].id;
    }
    return groups.find((g) => g.id === discoveryGroupId) ?? null;
  }

  function groupLabel(group) {
    return group.name && group.name.trim() !== "" ? group.name : S.unnamedGroup;
  }

  function discoveryPanel() {
    const group = discoveryGroup();
    if (!group) {
      return null;
    }
    const account = state.config.accounts.find((a) => a.id === group.accountId);
    const children = [];
    if (state.config.groups.length > 1) {
      const select = h("select", null);
      for (const g of state.config.groups) {
        select.appendChild(h("option", { value: g.id, selected: g.id === group.id }, groupLabel(g)));
      }
      select.addEventListener("change", () => {
        discoveryGroupId = select.value;
        render();
      });
      children.push(h("div", { class: "row" }, labeled(S.addToGroup, select)));
    }
    children.push(
      accountKindOf(account) === "bamboo"
        ? discoveryPlansBody(group, account)
        : discoveryWorkflowsBody(group, account),
    );
    return h("div", { class: "addbox" }, children);
  }

  function discoveryWorkflowsBody(group, account) {
    // One input for the repository: the user pastes the repository URL
    // (or anything readable as owner/repo) and the extension host reads
    // owner/repo out of it — no separate owner/repo typing.
    const dUrl = h("input", { type: "text", placeholder: S.repoUrlPlaceholder });
    const dList = h("div", { class: "checklist" });
    const listBtn = h(
      "button",
      {
        class: "add-btn",
        onclick: () => {
          const requestId = `discover-${++requestSeq}`;
          pending[requestId] = (msg) => {
            if (msg.code === "badRepoUrl") {
              dList.replaceChildren(h("span", { class: "result-ng" }, S.discoverBadUrl));
              return;
            }
            if (msg.error) {
              dList.replaceChildren(h("span", { class: "result-ng" }, msg.error));
              return;
            }
            discovered[group.id] = msg.workflows;
            renderDiscovered(group, dList, msg.owner, msg.repo);
          };
          vscode.postMessage({
            type: "discover",
            requestId,
            groupId: group.id,
            accountId: group.accountId,
            baseUrl: account ? account.baseUrl : "",
            token: tokens[group.accountId] || "",
            repoText: dUrl.value,
          });
        },
      },
      S.listWorkflows,
    );
    return h(
      "div",
      null,
      h("h3", { class: "addbox-title" }, S.addByDiscovery),
      h("div", { class: "row" }, dUrl, listBtn),
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
        class: "add-btn",
        onclick: () => {
          for (const { wf, cb } of checks) {
            if (cb.checked) {
              const already = group.workflows.some(
                (w) => w.owner === owner && w.repo === repo && w.workflow === wf.file,
              );
              if (!already) {
                group.workflows.push({ owner, repo, workflow: wf.file, starred: true });
              }
            }
          }
          render();
        },
      },
      `+ ${S.addSelected}`,
    );
    container.replaceChildren(...checks.map((c) => c.row), addBtn);
  }

  function discoveryPlansBody(group, account) {
    const dList = h("div", { class: "checklist" });
    const listBtn = h(
      "button",
      {
        class: "add-btn",
        onclick: () => {
          if (!account || !account.baseUrl || account.baseUrl.trim() === "") {
            dList.replaceChildren(h("span", { class: "result-ng" }, S.plansNeedsServer));
            return;
          }
          const requestId = `discover-plans-${++requestSeq}`;
          pending[requestId] = (msg) => {
            if (msg.error) {
              dList.replaceChildren(h("span", { class: "result-ng" }, msg.error));
              return;
            }
            discoveredPlans[group.id] = msg.plans;
            renderDiscoveredPlans(group, dList);
          };
          vscode.postMessage({
            type: "discoverPlans",
            requestId,
            groupId: group.id,
            accountId: group.accountId,
            baseUrl: account.baseUrl,
            token: tokens[group.accountId] || "",
          });
        },
      },
      S.listPlans,
    );
    return h(
      "div",
      null,
      h("h3", { class: "addbox-title" }, S.addByDiscoveryPlans),
      h("div", { class: "row" }, listBtn),
      dList,
    );
  }

  function renderDiscoveredPlans(group, container) {
    const items = discoveredPlans[group.id] || [];
    if (items.length === 0) {
      container.replaceChildren(h("span", { class: "hint" }, S.noPlans));
      return;
    }
    // The payload arrives sorted by project, then plan: a heading per
    // project, one checkbox per plan. Plans already in the group are
    // shown ticked and disabled, and adding never duplicates a plan.
    const children = [];
    const checks = [];
    let lastProject = null;
    for (const p of items) {
      if (p.projectKey !== lastProject) {
        children.push(h("h4", { class: "checklist-group" }, `${p.projectName} (${p.projectKey})`));
        lastProject = p.projectKey;
      }
      const already = group.workflows.some((w) => w.planKey === p.planKey);
      const cb = h("input", { type: "checkbox", checked: true });
      if (already) {
        cb.disabled = true;
      }
      checks.push({ p, cb, already });
      children.push(h("label", { class: "inline" }, cb, `${p.name} (${p.planKey})`));
    }
    const addBtn = h(
      "button",
      {
        class: "add-btn",
        onclick: () => {
          for (const { p, cb, already } of checks) {
            if (cb.checked && !already) {
              group.workflows.push({ projectKey: p.projectKey, planKey: p.planKey, starred: true });
            }
          }
          render();
        },
      },
      `+ ${S.addSelected}`,
    );
    children.push(addBtn);
    container.replaceChildren(...children);
  }

  function groupCard(group) {
    const isBamboo = groupKind(group) === "bamboo";
    const accountSelect = h("select", null);
    for (const a of state.config.accounts) {
      const opt = h("option", { value: a.id, selected: a.id === group.accountId }, a.name);
      accountSelect.appendChild(opt);
    }
    accountSelect.addEventListener("change", () => {
      group.accountId = accountSelect.value;
      // The entry editor's shape follows the account kind: re-render.
      render();
    });
    const table =
      group.workflows.length === 0
        ? h("div", { class: "empty" }, isBamboo ? S.noPlans : S.noWorkflows)
        : h(
            "table",
            { class: "workflows" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, isBamboo ? S.project : S.repository),
                h("th", null, isBamboo ? S.planKey : S.workflowFile),
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
        removeButton(() => {
          state.config.groups = state.config.groups.filter((g) => g.id !== group.id);
          render();
        }),
      ),
      h("h3", null, isBamboo ? S.plans : S.workflows),
      table,
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
    const panel = discoveryPanel();
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
          class: "add-btn",
          onclick: () => {
            config.accounts.push({ id: uid(), name: "", baseUrl: "https://api.github.com" });
            render();
          },
        },
        `+ ${S.addAccount}`,
      ),
      h("h2", null, S.groups),
      ...(config.groups.length === 0 ? [h("div", { class: "empty" }, S.noGroups)] : config.groups.map(groupCard)),
      h(
        "button",
        {
          class: "add-btn",
          onclick: () => {
            if (config.accounts.length === 0) return;
            const group = { id: uid(), name: "", accountId: config.accounts[0].id, workflows: [] };
            config.groups.push(group);
            // The new group is the natural next thing to fill.
            discoveryGroupId = group.id;
            render();
          },
        },
        `+ ${S.addGroup}`,
      ),
      ...(panel ? [panel] : []),
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
    // Ask the extension to close the panel; unsaved edits live only in
    // this webview, so closing discards them all.
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
      discoveredPlans = {};
      discoveryGroupId = null;
      render();
    } else if (msg.type === "testResult" || msg.type === "discovered" || msg.type === "discoveredPlans") {
      const cb = pending[msg.requestId];
      if (cb) {
        delete pending[msg.requestId];
        cb(msg);
      }
    }
  });

  vscode.postMessage({ type: "ready" });
})();
