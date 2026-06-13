<script lang="ts">
  import '$lib/styles/app.css';
  import { marked } from 'marked';
  import { tick } from 'svelte';
  import type { WorkerEvent } from '@sop/worker/contract';

  type Step = { type: 'thought' | 'tool' | 'result' | 'err'; name?: string; text: string };
  type Item =
    | { kind: 'user'; text: string; files: { name: string; url?: string }[] }
    | { kind: 'group'; open: boolean; steps: Step[] }
    | { kind: 'message'; html: string }
    | { kind: 'final'; html: string }
    | {
        kind: 'approval';
        id: string;
        summary: string;
        details?: string;
        status: 'pending' | 'approved' | 'rejected';
      };

  let ticket = $state('');
  let files = $state<{ file: File; name: string; url?: string }[]>([]);
  let running = $state(false);
  let runId = $state<string | null>(null);
  let items = $state<Item[]>([]);
  let sopTitle = $state<string | null>(null);
  let sopHtml = $state<string>('');
  let transcriptEl: HTMLDivElement | undefined = $state();

  // The agent's current state, derived from the run. Drives the header status pill.
  const statusInfo = $derived.by(() => {
    const pending = items.some((it) => it.kind === 'approval' && it.status === 'pending');
    if (pending) return { cls: 'status--await', label: 'Awaiting approval' };
    if (running) return { cls: 'status--working', label: 'Working…' };
    if (items.length > 0) return { cls: 'status--done', label: 'Done' };
    return { cls: 'status--idle', label: 'Idle' };
  });

  function md(src: string): string {
    const html = marked.parse(src, { async: false }) as string;
    // Keep a single top-level <h1> on the page (the app title): nest every
    // heading from rendered markdown (SOP, agent/final messages) one level
    // deeper. Safe on marked's deterministic <hN>…</hN> output.
    return html.replace(/<(\/?)h([1-5])\b/g, (_m, slash, n) => `<${slash}h${Number(n) + 1}`);
  }

  async function scroll() {
    await tick();
    if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  function pushStep(step: Step) {
    const last = items[items.length - 1];
    if (last && last.kind === 'group') {
      last.steps.push(step);
      items = [...items];
    } else {
      items = [...items, { kind: 'group', open: false, steps: [step] }];
    }
  }

  function handle(e: WorkerEvent) {
    switch (e.type) {
      case 'assistant_text':
        pushStep({ type: 'thought', text: e.text });
        break;
      case 'tool_use':
        pushStep({
          type: 'tool',
          name: e.name.replace(/^mcp__sop__/, ''),
          text: typeof e.input === 'string' ? e.input : JSON.stringify(e.input),
        });
        break;
      case 'tool_result':
        pushStep({
          type: e.isError ? 'err' : 'result',
          name: e.name.replace(/^mcp__sop__/, ''),
          text: e.preview,
        });
        break;
      case 'sop_selected':
        sopTitle = e.title;
        sopHtml = md(e.markdown);
        break;
      case 'send_to_user':
        items = [...items, { kind: 'message', html: md(e.content) }];
        break;
      case 'final':
        items = [...items, { kind: 'final', html: md(e.text) }];
        break;
      case 'approval_request':
        items = [
          ...items,
          { kind: 'approval', id: e.id, summary: e.summary, details: e.details, status: 'pending' },
        ];
        break;
      case 'approval_resolved': {
        const it = items.find((x) => x.kind === 'approval' && x.id === e.id) as
          | Extract<Item, { kind: 'approval' }>
          | undefined;
        if (it) it.status = e.approved ? 'approved' : 'rejected';
        items = [...items];
        break;
      }
      case 'error':
        pushStep({ type: 'err', text: e.message });
        break;
      case 'run_finished':
        running = false;
        break;
    }
    void scroll();
  }

  function onPaste(ev: ClipboardEvent) {
    const its = ev.clipboardData?.items;
    if (!its) return;
    for (const it of its) {
      if (it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) {
          const name = f.name || `pasted-${files.length + 1}.png`;
          files = [
            ...files,
            { file: new File([f], name, { type: f.type }), name, url: URL.createObjectURL(f) },
          ];
        }
      }
    }
  }

  function onPickFiles(ev: Event) {
    const list = (ev.target as HTMLInputElement).files;
    if (!list) return;
    for (const f of Array.from(list)) {
      files = [
        ...files,
        {
          file: f,
          name: f.name,
          url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        },
      ];
    }
    (ev.target as HTMLInputElement).value = '';
  }

  function removeFile(i: number) {
    files = files.filter((_, idx) => idx !== i);
  }

  async function submit() {
    if (!ticket.trim() || running) return;
    const fd = new FormData();
    fd.set('ticket', ticket);
    for (const f of files) fd.append('files', f.file, f.name);
    items = [
      ...items,
      { kind: 'user', text: ticket, files: files.map((f) => ({ name: f.name, url: f.url })) },
    ];
    const submittedTicket = ticket;
    ticket = '';
    const submittedFiles = files;
    files = [];
    running = true;
    void scroll();

    try {
      const res = await fetch('/api/run', { method: 'POST', body: fd });
      const data = await res.json();
      runId = data.runId;
      const es = new EventSource(`/api/run/${runId}/stream`);
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data) as WorkerEvent;
        handle(ev);
        if (ev.type === 'run_finished') es.close();
      };
      es.onerror = () => {
        if (!running) es.close();
      };
    } catch (err) {
      pushStep({ type: 'err', text: (err as Error).message });
      running = false;
    }
    void submittedTicket;
    void submittedFiles;
  }

  async function decide(id: string, approved: boolean) {
    if (!runId) return;
    await fetch(`/api/run/${runId}/approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalId: id, approved }),
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div class="app">
  <main class="pane" aria-label="Conversation and activity">
    <div class="topbar">
      <span class="brandmark" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"><path d="M5 7l5 5-5 5" /><path d="M13 17h6" /></svg
        >
      </span>
      <div class="brand-text">
        <h1 class="logo">SOP Worker</h1>
        <div class="sub">submit a ticket — the agent finds the SOP and works the browser</div>
      </div>
      <span class="status {statusInfo.cls}" role="status" aria-live="polite">
        <span class="dot" aria-hidden="true"></span>
        {statusInfo.label}
      </span>
    </div>

    <div class="transcript" bind:this={transcriptEl} role="log" aria-label="Transcript">
      {#each items as item, i (i)}
        {#if item.kind === 'user'}
          <div class="turn">
            <div class="meta meta--right"><span class="who">You</span></div>
            <div class="msg user">
              <div class="user-bubble">
                {item.text}
                {#if item.files.length}
                  <div class="attachments">
                    {#each item.files as f (f.name)}
                      <span class="chip" title={f.name}>
                        {#if f.url}
                          <span class="thumb"><img src={f.url} alt={f.name} /></span>
                        {:else}
                          <span class="file-ico" aria-hidden="true">
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              ><path d="M14 3v5h5" /><path
                                d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
                              /></svg
                            >
                          </span>
                        {/if}
                        <span class="fname">{f.name}</span>
                      </span>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else if item.kind === 'group'}
          <div class="turn">
            <div class="meta"><span class="who">Agent</span><span>· internal steps</span></div>
            <details class="group" open={item.open} data-testid="work-group">
              <summary>
                <span class="act-ico" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><circle cx="12" cy="12" r="3" /><path
                      d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"
                    /></svg
                  >
                </span>
                <span class="act-summary"
                  ><b>{item.steps.length} step{item.steps.length === 1 ? '' : 's'}</b> — working in
                  the browser <span class="act-hint">(click to expand)</span></span
                >
                {#if running && i === items.length - 1}<span class="spinner" aria-label="working"
                  ></span>{/if}
                <span class="chev" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg
                  >
                </span>
              </summary>
              <div class="steps">
                {#each item.steps as s, si (si)}
                  <div class="step step--{s.type === 'err' ? 'error' : s.type}">
                    <div class="step-kind">
                      {s.type === 'thought'
                        ? 'Thought'
                        : s.type === 'tool'
                          ? 'Tool call'
                          : s.type === 'err'
                            ? 'Error'
                            : 'Tool result'}
                    </div>
                    {#if s.type === 'thought'}
                      <div class="step-thought">{s.text}</div>
                    {:else}
                      <div class="step-row">
                        {#if s.name}<span class="toolname">{s.name}</span>{/if}
                        <span class="io {s.type === 'tool' ? '' : 'io--out'}">{s.text}</span>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            </details>
          </div>
        {:else if item.kind === 'message'}
          <div class="turn">
            <div class="meta"><span class="who">Agent</span></div>
            <div class="msg agent">
              <div class="agent-bubble" data-testid="send-to-user">{@html item.html}</div>
            </div>
          </div>
        {:else if item.kind === 'final'}
          <div class="turn">
            <div class="msg final" data-testid="final">
              <span class="final-ico" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
                >
              </span>
              <div class="final-body">
                <div class="final-label">Result</div>
                <div class="final-text">{@html item.html}</div>
              </div>
            </div>
          </div>
        {:else if item.kind === 'approval'}
          <div class="turn">
            <div
              class="approval {item.status !== 'pending' ? `resolved ${item.status}` : ''}"
              data-testid="approval"
              role="group"
              aria-label="Approval needed"
            >
              <div class="title">
                {#if item.status === 'pending'}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path
                      d="M10.3 3.6 1.8 18a1.5 1.5 0 0 0 1.3 2.3h17.8A1.5 1.5 0 0 0 22.2 18L13.7 3.6a1.5 1.5 0 0 0-2.6 0Z"
                    /><path d="M12 9v4M12 17h.01" /></svg
                  >
                {:else}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><circle cx="12" cy="12" r="9" /><path d="M9 12l2 2 4-4" /></svg
                  >
                {/if}
                Approval needed
              </div>
              <div class="approval-summary">{item.summary}</div>
              {#if item.details}<div class="muted">{item.details}</div>{/if}
              {#if item.status === 'pending'}
                <div class="actions">
                  <button
                    class="btn approve"
                    data-testid="approve"
                    onclick={() => decide(item.id, true)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
                    >
                    Approve
                  </button>
                  <button
                    class="btn reject"
                    data-testid="reject"
                    onclick={() => decide(item.id, false)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg
                    >
                    Reject
                  </button>
                </div>
              {:else}
                <span class="resolved-tag {item.status}">
                  {#if item.status === 'approved'}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
                    >
                  {:else}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg
                    >
                  {/if}
                  → {item.status}
                </span>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
      {#if items.length === 0}
        <div class="transcript-empty">
          <span class="hint-label">Try a ticket</span>
          “Enter a B2B sales order for THE Builders of Nevada (account 5129), PO ‘Token Restock’, 200
          of item 13828 and 50 of item 13020, then approve it.” You can paste an image or attach a spreadsheet.
        </div>
      {/if}
    </div>

    <div class="composer">
      {#if files.length}
        <div class="attachments">
          {#each files as f, i (f.name + i)}
            <span class="chip" title={f.name}>
              {#if f.url}
                <span class="thumb"><img src={f.url} alt={f.name} /></span>
              {:else}
                <span class="file-ico" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M14 3v5h5" /><path
                      d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
                    /></svg
                  >
                </span>
              {/if}
              <span class="fname">{f.name}</span>
              <button class="x" aria-label={`Remove ${f.name}`} onclick={() => removeFile(i)}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg
                >
              </button>
            </span>
          {/each}
        </div>
      {/if}
      <div class="composer-box">
        <textarea
          bind:value={ticket}
          onpaste={onPaste}
          onkeydown={onKey}
          placeholder="Describe the ticket… (⌘/Ctrl+Enter to send; paste an image, or attach a file)"
          data-testid="ticket"
          aria-label="Describe the ticket"
        ></textarea>
        <div class="row">
          <label class="icon-btn">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M21.4 11.05 12.25 20.2a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49"
              /></svg
            >
            Attach
            <input type="file" multiple style="display:none" onchange={onPickFiles} />
          </label>
          <div class="composer-right">
            <span class="send-hint"><kbd>⌘</kbd> <kbd>↵</kbd> to send</span>
            <button
              class="btn send {running ? 'working' : ''}"
              onclick={submit}
              disabled={running || !ticket.trim()}
              data-testid="send"
            >
              {#if running}
                <span class="spinner" aria-hidden="true"></span>
                Working…
              {:else}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" /></svg
                >
                Send
              {/if}
            </button>
          </div>
        </div>
      </div>
    </div>
  </main>

  <aside class="pane right" aria-label="Standard Operating Procedure">
    <div class="sop-head">
      <div class="label">Standard Operating Procedure</div>
      <div class="title">
        <span class="doc-ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M14 3v5h5" /><path
              d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
            /><path d="M8 13h6M8 17h5" /></svg
          >
        </span>
        {sopTitle ?? 'none selected yet'}
      </div>
    </div>
    {#if sopHtml}
      <div class="sop-body" data-testid="sop-body">{@html sopHtml}</div>
    {:else}
      <div class="sop-empty">
        <span class="e-ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            ><path d="M14 3v5h5" /><path
              d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"
            /></svg
          >
        </span>
        <div>
          <div class="e-label">Before a SOP is chosen</div>
          <div class="e-text">The agent will show the SOP it chooses to follow here.</div>
        </div>
      </div>
    {/if}
  </aside>
</div>
