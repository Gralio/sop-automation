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

  function md(src: string): string {
    return marked.parse(src, { async: false }) as string;
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
  <div class="col">
    <div class="topbar">
      <span class="logo">SOP Worker</span>
      <span class="sub">submit a ticket — the agent finds the SOP and works the browser</span>
      {#if running}<span class="grow"></span><span class="spinner"></span>{/if}
    </div>

    <div class="transcript" bind:this={transcriptEl}>
      {#each items as item, i (i)}
        {#if item.kind === 'user'}
          <div class="msg user">
            <div>{item.text}</div>
            {#if item.files.length}
              <div class="attachments">
                {#each item.files as f (f.name)}
                  <span class="chip"
                    >{#if f.url}<img src={f.url} alt={f.name} />{/if}{f.name}</span
                  >
                {/each}
              </div>
            {/if}
          </div>
        {:else if item.kind === 'group'}
          <details class="group" open={item.open} data-testid="work-group">
            <summary
              >{#if running && i === items.length - 1}<span class="spinner"></span>{/if}
              {item.steps.length} step{item.steps.length === 1 ? '' : 's'} — working in the browser (click
              to expand)</summary
            >
            <div class="steps">
              {#each item.steps as s, si (si)}
                <div class="step {s.type}">
                  {#if s.name}<span class="name">{s.name}</span>
                  {/if}<span class="io">{s.text}</span>
                </div>
              {/each}
            </div>
          </details>
        {:else if item.kind === 'message'}
          <div class="msg agent" data-testid="send-to-user">{@html item.html}</div>
        {:else if item.kind === 'final'}
          <div class="msg final" data-testid="final">{@html item.html}</div>
        {:else if item.kind === 'approval'}
          <div
            class="approval {item.status !== 'pending' ? 'resolved' : ''}"
            data-testid="approval"
          >
            <div class="title">Approval needed</div>
            <div>{item.summary}</div>
            {#if item.details}<div class="muted">{item.details}</div>{/if}
            {#if item.status === 'pending'}
              <div class="actions">
                <button
                  class="btn approve"
                  data-testid="approve"
                  onclick={() => decide(item.id, true)}>Approve</button
                >
                <button
                  class="btn reject"
                  data-testid="reject"
                  onclick={() => decide(item.id, false)}>Reject</button
                >
              </div>
            {:else}
              <div class="muted">→ {item.status}</div>
            {/if}
          </div>
        {/if}
      {/each}
      {#if items.length === 0}
        <div class="sop-empty">
          Try: “Enter a B2B sales order for THE Builders of Nevada (account 5129), PO ‘Token
          Restock’, 200 of item 13828 and 50 of item 13020, then approve it.” You can paste an image
          or attach a spreadsheet.
        </div>
      {/if}
    </div>

    <div class="composer">
      <textarea
        bind:value={ticket}
        onpaste={onPaste}
        onkeydown={onKey}
        placeholder="Describe the ticket… (⌘/Ctrl+Enter to send; paste an image, or attach a file)"
        data-testid="ticket"
      ></textarea>
      {#if files.length}
        <div class="attachments">
          {#each files as f, i (f.name + i)}
            <span class="chip"
              >{#if f.url}<img src={f.url} alt={f.name} />{/if}{f.name}
              <button class="btn" style="padding:0 6px" onclick={() => removeFile(i)}>✕</button
              ></span
            >
          {/each}
        </div>
      {/if}
      <div class="row">
        <label class="btn"
          >Attach<input type="file" multiple style="display:none" onchange={onPickFiles} /></label
        >
        <span class="grow"></span>
        <button
          class="btn approve"
          onclick={submit}
          disabled={running || !ticket.trim()}
          data-testid="send"
        >
          {running ? 'Working…' : 'Send'}
        </button>
      </div>
    </div>
  </div>

  <div class="col right">
    <div class="sop-head">
      <div class="label">Standard Operating Procedure</div>
      <div class="title">{sopTitle ?? 'none selected yet'}</div>
    </div>
    {#if sopHtml}
      <div class="sop-body" data-testid="sop-body">{@html sopHtml}</div>
    {:else}
      <div class="sop-empty">The agent will show the SOP it chooses to follow here.</div>
    {/if}
  </div>
</div>
