import './styles.css';
import { env, pipeline } from '@xenova/transformers';

type Role = 'user' | 'assistant';
type Message = { id: string; role: Role; text: string; at: number };
type Conversation = { id: string; title: string; createdAt: number; messages: Message[] };
type Generator = (input: string, options: Record<string, unknown>) => Promise<Array<{ generated_text: string }>>;
type AgentAction = { type: 'navigate'; url: string } | { type: 'click'; target: string; index?: number } | { type: 'type'; target: string; text: string; index?: number } | { type: 'key'; key: 'ENTER' | 'TAB' | 'ESCAPE' } | { type: 'wait'; milliseconds: number };
type AgentPlan = { task: string; summary: string; actions: AgentAction[] };
type PageItem = { index: number; label: string; tag: string; type: string; x: number; y: number; width: number; height: number; password: boolean };
type PageSnapshot = { url: string; title: string; text: string; items: PageItem[] };

const MODEL_ID = 'Xenova/LaMini-Flan-T5-77M';
const MODEL_LABEL = 'Luma Local · 77M';
const storageKey = 'luma.conversations.v1';
const $ = <T extends Element>(selector: string, parent: ParentNode = document): T => {
  const node = parent.querySelector(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node as T;
};
const $$ = <T extends Element>(selector: string, parent: ParentNode = document): T[] => Array.from(parent.querySelectorAll(selector)) as T[];
const id = () => crypto.randomUUID();
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
const time = (at: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at);

class LumaApp {
  private conversations: Conversation[] = [];
  private activeId = '';
  private generator: Generator | null = null;
  private loadingModel: Promise<void> | null = null;
  private generating = false;
  private modelState = 'Not installed on this device';
  private browserVisible = true;
  private browserAddress = 'https://duckduckgo.com';
  private agentMode = false;
  private pendingPlan: AgentPlan | null = null;
  private agentRunning = false;
  private browserReady = false;

  init(): void {
    // The browser cache is the only model cache. No model request is sent to an AI API.
    env.useBrowserCache = true;
    env.allowRemoteModels = true;
    this.loadConversations();
    this.render();
    this.bind();
  }

  private loadConversations(): void {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Conversation[];
      this.conversations = Array.isArray(stored) ? stored : [];
    } catch {
      this.conversations = [];
    }
    if (!this.conversations.length) this.newConversation();
    this.activeId = this.conversations[0]?.id ?? '';
  }

  private persist(): void {
    localStorage.setItem(storageKey, JSON.stringify(this.conversations));
  }

  private get active(): Conversation {
    const conversation = this.conversations.find(item => item.id === this.activeId);
    if (!conversation) throw new Error('Active chat not found');
    return conversation;
  }

  private newConversation(): void {
    const conversation: Conversation = { id: id(), title: 'New conversation', createdAt: Date.now(), messages: [] };
    this.conversations.unshift(conversation);
    this.activeId = conversation.id;
    this.persist();
  }

  private render(): void {
    this.browserReady = false;
    $('#app').innerHTML = `<div class="app-shell ${this.browserVisible ? '' : 'browser-hidden'}">
      <header class="top">
        <div class="brand"><span class="mark">l</span><span>luma</span></div>
        <span class="top-sub">standalone local AI browser</span><span class="top-spacer"></span>
        <span class="privacy"><i></i> Your chats stay on this device</span>
        <button id="toggle-browser" aria-label="Show or hide browser">${this.browserVisible ? 'Hide browser' : 'Show browser'}</button>
      </header>
      <aside class="sidebar">
        <div class="sidebar-head"><span class="section-label">Conversations</span><button class="new-chat" id="new-chat">＋ New</button></div>
        <div class="conversation-list" id="conversation-list">${this.renderConversations()}</div>
        <div class="side-foot">
          <div class="agent-card"><div><div class="model-name">Browser agent</div><div class="model-state">${this.agentMode ? 'Reads this browser, plans actions, then waits for your approval.' : 'Ask questions normally, or enable actions in the embedded browser.'}</div></div><button id="agent-toggle" class="agent-toggle ${this.agentMode ? 'on' : ''}" aria-pressed="${this.agentMode}"><i></i>${this.agentMode ? 'Agent on' : 'Agent off'}</button></div>
          <div class="model-card"><div class="model-name">${MODEL_LABEL}</div><div class="model-state" id="model-state">${escapeHtml(this.modelState)}</div><button class="model-install" id="model-install">${this.generator ? 'Model ready' : 'Install offline model'}</button></div>
        </div>
      </aside>
      <main class="chat"><header class="chat-head"><div><div class="chat-title">${escapeHtml(this.active.title)}</div><div class="chat-meta">${this.agentMode ? 'Agent mode · actions always need approval' : 'Private chat · stored locally'}</div></div><span class="head-spacer"></span><span class="chip" id="model-chip">${this.agentMode ? 'Review before run' : this.generator ? 'Local AI ready' : 'Model needed'}</span></header><section class="messages" id="messages">${this.renderMessages()}</section><footer class="composer-wrap"><div class="composer"><textarea id="prompt" rows="1" placeholder="${this.agentMode ? 'Tell Luma what to do in the browser…' : 'Message Luma…'}" aria-label="Message Luma"></textarea><button class="send" id="send" aria-label="Send message" title="Send message">↑</button></div><div class="composer-note" id="composer-note">${this.agentMode ? 'Agent plans browser clicks and typing, then you review it before anything runs.' : 'Enter to send · Shift Enter for a new line · AI runs locally after the one-time model download.'}</div></footer></main>
      <aside class="browser ${this.browserVisible ? '' : 'hidden'}" id="browser-panel"><header class="browser-head"><span class="browser-title">Browser <span class="browser-agent-indicator ${this.agentMode ? 'active' : ''}">${this.agentMode ? 'Agent ready' : ''}</span></span><button id="open-external" title="Open page in your default browser">↗</button></header><div class="browser-nav"><div class="nav-tools"><button id="back" aria-label="Back">←</button><button id="forward" aria-label="Forward">→</button><button id="reload" aria-label="Reload">↻</button></div><input id="address" class="address" value="${escapeHtml(this.browserAddress)}" aria-label="Web address"><div class="nav-tools"><button id="go" aria-label="Go">↵</button></div></div><div class="browser-frame"><webview id="web" src="${escapeHtml(this.browserAddress)}" partition="persist:luma-browser" allowpopups></webview><div id="browser-unavailable" class="browser-offline"><div><b>Browser preview</b><br>Open Luma as a desktop app to browse websites and run approved browser actions here.</div></div></div></aside>
    </div>`;
  }

  private renderConversations(): string {
    return this.conversations.map(conversation => `<button class="conversation ${conversation.id === this.activeId ? 'active' : ''}" data-conversation="${conversation.id}"><span class="conversation-title">${escapeHtml(conversation.title)}</span><span class="conversation-delete" data-delete="${conversation.id}" aria-label="Delete ${escapeHtml(conversation.title)}">×</span></button>`).join('');
  }

  private renderMessages(): string {
    const messages = this.active.messages;
    const plan = this.pendingPlan && this.pendingPlan.task ? this.renderPlan(this.pendingPlan) : '';
    if (!messages.length) return `<div class="empty-chat"><div class="orb">✦</div><h1>Private, capable, yours.</h1><p>Luma is a local AI chat and browser. Turn on Browser agent to let it plan safe navigation, clicking, and typing in the page beside this chat.</p><div class="suggestions"><button class="suggestion" data-suggest="Explain quantum computing simply">Explain a topic</button><button class="suggestion" data-suggest="Help me plan my week">Plan my week</button><button class="suggestion" data-suggest="Search for local hiking trails">Try browser agent</button></div></div>${plan}`;
    return messages.map(message => `<article class="message ${message.role}"><span class="avatar">${message.role === 'assistant' ? 'L' : 'You'}</span><div><div class="bubble">${escapeHtml(message.text)}</div><div class="message-time">${time(message.at)}</div></div></article>`).join('') + plan;
  }

  private renderPlan(plan: AgentPlan): string {
    const icons: Record<AgentAction['type'], string> = { navigate: '↗', click: '◉', type: '⌨', key: '↵', wait: '◌' };
    const describe = (action: AgentAction): string => action.type === 'navigate' ? `Open ${action.url}` : action.type === 'click' ? `Click “${action.target}”` : action.type === 'type' ? `Type into “${action.target}”` : action.type === 'key' ? `Press ${action.key}` : `Wait ${action.milliseconds}ms`;
    return `<article class="agent-plan"><div class="agent-plan-head"><span class="avatar">L</span><div><b>Browser action plan</b><div class="list-meta">${escapeHtml(plan.summary)}</div></div><span class="chip">approval required</span></div><ol>${plan.actions.map(action => `<li><span>${icons[action.type]}</span>${escapeHtml(describe(action))}</li>`).join('')}</ol>${plan.actions.length ? '<div class="agent-plan-actions"><button class="btn ghost" id="agent-cancel">Cancel</button><button class="btn primary" id="agent-run">Review & run</button></div>' : '<p class="agent-plan-empty">No safe browser action was identified. Try wording the task with a site, button, or field name.</p>'}</article>`;
  }

  private bind(): void {
    $('#new-chat').addEventListener('click', () => { this.newConversation(); this.render(); this.bind(); });
    $('#toggle-browser').addEventListener('click', () => { this.browserVisible = !this.browserVisible; this.render(); this.bind(); });
    $('#agent-toggle').addEventListener('click', () => { this.agentMode = !this.agentMode; this.pendingPlan = null; if (this.agentMode) this.browserVisible = true; this.render(); this.bind(); });
    $$('#conversation-list [data-conversation]').forEach(button => button.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      const deletion = target.closest<HTMLElement>('[data-delete]');
      if (deletion) { event.stopPropagation(); this.deleteConversation(deletion.dataset.delete ?? ''); return; }
      this.activeId = (button as HTMLElement).dataset.conversation ?? this.activeId;
      this.render(); this.bind();
    }));
    $('#model-install').addEventListener('click', () => void this.prepareModel());
    const input = $('#prompt') as HTMLTextAreaElement;
    input.addEventListener('input', () => this.resizeComposer(input));
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void this.send(); } });
    $('#send').addEventListener('click', () => void this.send());
    $$('.suggestion').forEach(button => button.addEventListener('click', () => { input.value = (button as HTMLElement).dataset.suggest ?? ''; this.resizeComposer(input); input.focus(); }));
    $('#agent-run')?.addEventListener('click', () => void this.runApprovedPlan());
    $('#agent-cancel')?.addEventListener('click', () => { this.pendingPlan = null; this.render(); this.bind(); });
    this.bindBrowser();
    requestAnimationFrame(() => { $('#messages').scrollTop = $('#messages').scrollHeight; input.focus(); });
  }

  private deleteConversation(conversationId: string): void {
    const conversation = this.conversations.find(item => item.id === conversationId);
    if (!conversation || !confirm(`Delete “${conversation.title}”? This only deletes it from this device.`)) return;
    this.conversations = this.conversations.filter(item => item.id !== conversationId);
    if (!this.conversations.length) this.newConversation();
    this.activeId = this.conversations[0]?.id ?? '';
    this.persist(); this.render(); this.bind();
  }

  private resizeComposer(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 170)}px`;
  }

  private setModelState(state: string): void {
    this.modelState = state;
    const stateNode = document.querySelector('#model-state'); if (stateNode) stateNode.textContent = state;
    const chip = document.querySelector('#model-chip'); if (chip) chip.textContent = this.generator ? 'Local AI ready' : 'Preparing model';
  }

  private async prepareModel(): Promise<void> {
    if (this.generator) return;
    if (this.loadingModel) return this.loadingModel;
    this.loadingModel = (async () => {
      try {
        this.setModelState('Downloading the local model for the first time…');
        const installButton = $('#model-install') as HTMLButtonElement; installButton.disabled = true; installButton.textContent = 'Preparing…';
        const loaded = await pipeline('text2text-generation', MODEL_ID, {
          quantized: true,
          progress_callback: (progress: { status?: string; file?: string; progress?: number }) => {
            const percent = typeof progress.progress === 'number' ? ` ${Math.round(progress.progress)}%` : '';
            this.setModelState(`${progress.status ?? 'Loading'}${percent}`);
          },
        });
        this.generator = loaded as unknown as Generator;
        this.setModelState('Installed locally and ready to chat.');
        installButton.disabled = false; installButton.textContent = 'Model ready';
        this.toast('Local model is ready. Nothing is sent to an AI API.');
      } catch (error) {
        this.setModelState('Model setup failed. Check your connection and try again.');
        const installButton = $('#model-install') as HTMLButtonElement; installButton.disabled = false; installButton.textContent = 'Try model install again';
        this.toast(error instanceof Error ? error.message : 'Model setup failed.', 'error');
      } finally { this.loadingModel = null; }
    })();
    return this.loadingModel;
  }

  private async send(): Promise<void> {
    const input = $('#prompt') as HTMLTextAreaElement;
    const text = input.value.trim();
    if (!text || this.generating || this.agentRunning) return;
    input.value = ''; this.resizeComposer(input);
    const conversation = this.active;
    conversation.messages.push({ id: id(), role: 'user', text, at: Date.now() });
    conversation.title = conversation.messages.filter(message => message.role === 'user')[0]?.text.slice(0, 34) || 'New conversation';
    this.persist(); this.pendingPlan = null; this.render(); this.bind();
    if (this.agentMode) { await this.planBrowserTask(text); return; }
    this.generating = true;
    const messageArea = $('#messages');
    const working = document.createElement('article'); working.className = 'message assistant'; working.innerHTML = '<span class="avatar">L</span><div><div class="bubble">Thinking locally…</div></div>'; messageArea.append(working); messageArea.scrollTop = messageArea.scrollHeight;
    try {
      await this.prepareModel();
      if (!this.generator) throw new Error('The local model is not ready yet.');
      const history = conversation.messages.slice(-6).map(message => `${message.role === 'user' ? 'User' : 'Luma'}: ${message.text}`).join('\n');
      const output = await this.generator(`Give a useful, direct response.\n${history}\nLuma:`, { max_new_tokens: 160, temperature: 0.7, repetition_penalty: 1.15 });
      const answer = output[0]?.generated_text?.trim();
      if (!answer) throw new Error('The local model returned no text. Try a shorter message.');
      conversation.messages.push({ id: id(), role: 'assistant', text: answer, at: Date.now() });
      this.persist(); this.render(); this.bind();
    } catch (error) {
      working.remove();
      this.toast(error instanceof Error ? error.message : 'The message could not be generated.', 'error');
    } finally { this.generating = false; }
  }

  private browser(): { executeJavaScript?: <T>(code: string, userGesture?: boolean) => Promise<T>; loadURL?: (url: string) => void; goBack?: () => void; goForward?: () => void; reload?: () => void; getURL?: () => string; sendInputEvent?: (input: Record<string, unknown>) => void; addEventListener?: (name: string, listener: () => void) => void } {
    return document.querySelector('#web') as unknown as ReturnType<LumaApp['browser']>;
  }

  private async inspectPage(): Promise<PageSnapshot> {
    const web = this.browser();
    if (!web?.executeJavaScript) throw new Error('Browser actions are available only in the Luma desktop app.');
    return web.executeJavaScript<PageSnapshot>(`(() => {
      const visible = (el) => { const r = el.getBoundingClientRect(); const style = getComputedStyle(el); return r.width > 2 && r.height > 2 && style.visibility !== 'hidden' && style.display !== 'none'; };
      const label = (el) => [el.getAttribute('aria-label'), el.innerText, el.value, el.placeholder, el.title, el.name, el.alt].find(Boolean) || el.tagName.toLowerCase();
      const items = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(visible).slice(0,80).map((el, index) => { const r = el.getBoundingClientRect(); return { index, label: String(label(el)).trim().replace(/\s+/g, ' ').slice(0,100), tag: el.tagName.toLowerCase(), type: el.type || '', x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height), password: el.type === 'password' }; });
      return { url: location.href, title: document.title, text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0,1000), items };
    })()`);
  }

  private async planBrowserTask(task: string): Promise<void> {
    this.generating = true;
    this.setAgentStatus('Reading the current browser page…');
    try {
      await this.prepareModel();
      if (!this.generator) throw new Error('The local model is not ready yet.');
      await this.waitForBrowser();
      const page = await this.inspectPage();
      const controls = page.items.map(item => ({ index: item.index, label: item.label, tag: item.tag, type: item.type, password: item.password }));
      const plannerPrompt = `You are a careful browser agent. Make a short JSON plan for the user task using only these action types: navigate {"type":"navigate","url":"https://..."}, click {"type":"click","target":"visible label","index":0}, type {"type":"type","target":"input label","text":"text","index":0}, key {"type":"key","key":"ENTER"}, wait {"type":"wait","milliseconds":800}. Never submit, purchase, delete, sign in, or enter passwords. Return only JSON: {"summary":"...","actions":[...]}. Task: ${JSON.stringify(task)}. Current page: ${JSON.stringify({ url: page.url, title: page.title, controls, text: page.text.slice(0,500) })}`;
      const output = await this.generator(plannerPrompt, { max_new_tokens: 220, temperature: 0.15, repetition_penalty: 1.1 });
      const plan = this.parsePlan(output[0]?.generated_text ?? '', task, page);
      this.pendingPlan = plan;
      this.render(); this.bind();
    } catch (error) {
      this.active.messages.push({ id: id(), role: 'assistant', text: `I could not inspect or plan actions for the browser: ${error instanceof Error ? error.message : 'Unknown error.'}`, at: Date.now() });
      this.persist(); this.render(); this.bind();
    } finally { this.generating = false; }
  }

  private parsePlan(modelText: string, task: string, page: PageSnapshot): AgentPlan {
    const fallback = this.fallbackPlan(task, page);
    try {
      const source = modelText.match(/\{[\s\S]*\}/)?.[0];
      if (!source) return fallback;
      const candidate = JSON.parse(source) as { summary?: unknown; actions?: unknown };
      if (!Array.isArray(candidate.actions)) return fallback;
      const actions: AgentAction[] = [];
      for (const item of candidate.actions.slice(0, 5) as unknown[]) {
        if (!item || typeof item !== 'object') continue;
        const action = item as Record<string, unknown>;
        if (action.type === 'navigate' && typeof action.url === 'string' && /^https?:\/\//i.test(action.url)) actions.push({ type: 'navigate', url: action.url });
        else if (action.type === 'click' && typeof action.target === 'string') actions.push({ type: 'click', target: action.target.slice(0, 100), index: typeof action.index === 'number' ? action.index : undefined });
        else if (action.type === 'type' && typeof action.target === 'string' && typeof action.text === 'string') actions.push({ type: 'type', target: action.target.slice(0, 100), text: action.text.slice(0, 1000), index: typeof action.index === 'number' ? action.index : undefined });
        else if (action.type === 'key' && ['ENTER', 'TAB', 'ESCAPE'].includes(String(action.key))) actions.push({ type: 'key', key: String(action.key) as 'ENTER' | 'TAB' | 'ESCAPE' });
        else if (action.type === 'wait' && typeof action.milliseconds === 'number') actions.push({ type: 'wait', milliseconds: Math.max(200, Math.min(5000, action.milliseconds)) });
      }
      return actions.length ? { task, summary: typeof candidate.summary === 'string' ? candidate.summary.slice(0, 160) : 'Local model proposed these browser actions.', actions } : fallback;
    } catch { return fallback; }
  }

  private fallbackPlan(task: string, page: PageSnapshot): AgentPlan {
    const normalized = task.toLowerCase();
    const direct = task.match(/(?:go to|open|navigate to|visit)\s+(https?:\/\/[^\s]+)/i);
    if (direct) return { task, summary: 'Open the requested website in Luma’s browser.', actions: [{ type: 'navigate', url: direct[1] }] };
    const search = task.match(/(?:search(?: for)?|look up|find)\s+(.+)/i);
    if (search) return { task, summary: 'Search the web for the requested topic.', actions: [{ type: 'navigate', url: `https://duckduckgo.com/?q=${encodeURIComponent(search[1])}` }] };
    const click = task.match(/(?:click|press|choose|select)\s+(.+)/i);
    if (click) {
      const text = click[1].replace(/["'.]/g, '').trim(); const item = page.items.find(value => value.label.toLowerCase().includes(text.toLowerCase()));
      if (item) return { task, summary: 'Click the matching browser control.', actions: [{ type: 'click', target: item.label, index: item.index }] };
    }
    const type = task.match(/(?:type|enter|write)\s+["']?(.+?)["']?\s+(?:in|into)\s+["']?(.+?)["']?$/i);
    if (type) {
      const item = page.items.find(value => !value.password && value.label.toLowerCase().includes(type[2].toLowerCase()));
      if (item) return { task, summary: 'Type into the matching browser field.', actions: [{ type: 'type', target: item.label, index: item.index, text: type[1] }] };
    }
    return { task, summary: 'I could not derive a safe action from that task.', actions: [] };
  }

  private async runApprovedPlan(): Promise<void> {
    const plan = this.pendingPlan;
    if (!plan || this.agentRunning) return;
    const sensitive = /submit|send|purchase|buy|pay|delete|remove|transfer|sign in|login|password/i.test(`${plan.task} ${plan.actions.map(action => JSON.stringify(action)).join(' ')}`);
    if (sensitive && !confirm('This plan may trigger a sensitive action. Luma will never enter passwords, but do you want to run these approved browser steps?')) return;
    this.agentRunning = true;
    try {
      for (const action of plan.actions) await this.executeAction(action);
      this.active.messages.push({ id: id(), role: 'assistant', text: `Browser task completed: ${plan.summary}`, at: Date.now() });
    } catch (error) {
      this.active.messages.push({ id: id(), role: 'assistant', text: `Browser task stopped: ${error instanceof Error ? error.message : 'Unknown action error.'}`, at: Date.now() });
    } finally {
      this.agentRunning = false; this.pendingPlan = null; this.persist(); this.render(); this.bind();
    }
  }

  private async executeAction(action: AgentAction): Promise<void> {
    const web = this.browser();
    if (!web) throw new Error('The embedded browser is not available.');
    if (action.type === 'navigate') { this.browserReady = false; this.browserAddress = action.url; web.loadURL?.(action.url); await this.waitForBrowser(); return; }
    if (action.type === 'wait') { await this.wait(action.milliseconds); return; }
    if (action.type === 'key') { web.sendInputEvent?.({ type: 'keyDown', keyCode: action.key }); web.sendInputEvent?.({ type: 'keyUp', keyCode: action.key }); await this.wait(450); return; }
    const target = await this.findTarget(action.target, action.index);
    if (!target) throw new Error(`I could not find “${action.target}” on the current page.`);
    if (target.password) throw new Error('Luma will not enter passwords. Please take over for password fields.');
    this.mouseClick(target);
    if (action.type === 'type') {
      await this.wait(150);
      for (const character of action.text) web.sendInputEvent?.({ type: 'char', keyCode: character });
      await this.wait(250);
    } else await this.wait(700);
  }

  private async findTarget(label: string, index?: number): Promise<PageItem | null> {
    const quoted = JSON.stringify(label.toLowerCase());
    const fallbackIndex = typeof index === 'number' ? index : -1;
    const web = this.browser();
    if (!web.executeJavaScript) throw new Error('Browser page inspection is unavailable.');
    return web.executeJavaScript<PageItem | null>(`(() => { const visible = (el) => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>2&&r.height>2&&s.visibility!=='hidden'&&s.display!=='none'; }; const getLabel=(el)=>[el.getAttribute('aria-label'),el.innerText,el.value,el.placeholder,el.title,el.name,el.alt].find(Boolean)||el.tagName.toLowerCase(); const all=Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).filter(visible); const wanted=${quoted}; let el=all.find(item=>String(getLabel(item)).trim().toLowerCase()===wanted)||all.find(item=>String(getLabel(item)).toLowerCase().includes(wanted)); if(!el && ${fallbackIndex}>=0) el=all[${fallbackIndex}]; if(!el) return null; el.scrollIntoView({block:'center',inline:'center'}); const r=el.getBoundingClientRect(); return {index:all.indexOf(el),label:String(getLabel(el)).trim(),tag:el.tagName.toLowerCase(),type:el.type||'',x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:Math.round(r.width),height:Math.round(r.height),password:el.type==='password'}; })()`);
  }

  private mouseClick(target: PageItem): void {
    const web = this.browser();
    if (!web.sendInputEvent) throw new Error('This browser build cannot send input events.');
    web.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
    web.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    web.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: 'left', clickCount: 1 });
  }

  private setAgentStatus(status: string): void { const note = document.querySelector('#composer-note'); if (note) note.textContent = status; }
  private wait(milliseconds: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, milliseconds)); }
  private async waitForBrowser(): Promise<void> {
    if (this.browserReady) return;
    const web = this.browser();
    if (!web?.addEventListener) throw new Error('Browser actions are available only in the Luma desktop app.');
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The browser page did not finish loading.')), 8000);
      web.addEventListener?.('dom-ready', () => { window.clearTimeout(timeout); this.browserReady = true; resolve(); });
    });
  }

  private bindBrowser(): void {
    const web = this.browser();
    const address = $('#address') as HTMLInputElement;
    const unavailable = $('#browser-unavailable');
    const useBrowser = (value = address.value): void => {
      const url = /^https?:\/\//i.test(value) ? value : `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
      if (web.loadURL) { this.browserAddress = url; web.loadURL(url); address.value = url; } else unavailable.classList.add('visible');
    };
    $('#go').addEventListener('click', () => useBrowser());
    address.addEventListener('keydown', event => { if (event.key === 'Enter') useBrowser(); });
    $('#back').addEventListener('click', () => web.goBack?.());
    $('#forward').addEventListener('click', () => web.goForward?.());
    $('#reload').addEventListener('click', () => web.reload?.());
    $('#open-external').addEventListener('click', () => {
      const current = web.getURL?.() || address.value;
      const desktop = (window as Window & { lumaDesktop?: { openExternal: (url: string) => void } }).lumaDesktop;
      if (desktop) desktop.openExternal(current); else window.open(current, '_blank', 'noopener');
    });
    if (web.addEventListener) {
      web.addEventListener('dom-ready', () => { this.browserReady = true; });
      web.addEventListener('did-navigate', () => { const current = web.getURL?.(); if (current) { this.browserAddress = current; address.value = current; } });
      web.addEventListener('did-navigate-in-page', () => { const current = web.getURL?.(); if (current) { this.browserAddress = current; address.value = current; } });
    } else unavailable.classList.add('visible');
  }

  private toast(text: string, kind = ''): void {
    document.querySelector('.toast')?.remove();
    const toast = document.createElement('div'); toast.className = `toast ${kind}`; toast.textContent = text; document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4600);
  }
}

new LumaApp().init();
