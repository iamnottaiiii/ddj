import './styles.css';
import { env, pipeline } from '@xenova/transformers';

type Role = 'user' | 'assistant';
type Message = { id: string; role: Role; text: string; at: number };
type Conversation = { id: string; title: string; createdAt: number; messages: Message[] };
type Generator = (input: string, options: Record<string, unknown>) => Promise<Array<{ generated_text: string }>>;

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
    $('#app').innerHTML = `<div class="app-shell">
      <header class="top">
        <div class="brand"><span class="mark">l</span><span>luma</span></div>
        <span class="top-sub">standalone local AI browser</span><span class="top-spacer"></span>
        <span class="privacy"><i></i> Your chats stay on this device</span>
        <button id="toggle-browser" aria-label="Show or hide browser">${this.browserVisible ? 'Hide browser' : 'Show browser'}</button>
      </header>
      <aside class="sidebar">
        <div class="sidebar-head"><span class="section-label">Conversations</span><button class="new-chat" id="new-chat">＋ New</button></div>
        <div class="conversation-list" id="conversation-list">${this.renderConversations()}</div>
        <div class="side-foot"><div class="model-card"><div class="model-name">${MODEL_LABEL}</div><div class="model-state" id="model-state">${escapeHtml(this.modelState)}</div><button class="model-install" id="model-install">${this.generator ? 'Model ready' : 'Install offline model'}</button></div></div>
      </aside>
      <main class="chat"><header class="chat-head"><div><div class="chat-title">${escapeHtml(this.active.title)}</div><div class="chat-meta">Private chat · stored locally</div></div><span class="head-spacer"></span><span class="chip" id="model-chip">${this.generator ? 'Local AI ready' : 'Model needed'}</span></header><section class="messages" id="messages">${this.renderMessages()}</section><footer class="composer-wrap"><div class="composer"><textarea id="prompt" rows="1" placeholder="Message Luma…" aria-label="Message Luma"></textarea><button class="send" id="send" aria-label="Send message" title="Send message">↑</button></div><div class="composer-note" id="composer-note">Enter to send · Shift Enter for a new line · AI runs locally after the one-time model download.</div></footer></main>
      <aside class="browser ${this.browserVisible ? '' : 'hidden'}" id="browser-panel"><header class="browser-head"><span class="browser-title">Browser</span><button id="open-external" title="Open page in your default browser">↗</button></header><div class="browser-nav"><div class="nav-tools"><button id="back" aria-label="Back">←</button><button id="forward" aria-label="Forward">→</button><button id="reload" aria-label="Reload">↻</button></div><input id="address" class="address" value="https://duckduckgo.com" aria-label="Web address"><div class="nav-tools"><button id="go" aria-label="Go">↵</button></div></div><div class="browser-frame"><webview id="web" src="https://duckduckgo.com" partition="persist:luma-browser" allowpopups></webview><div id="browser-unavailable" class="browser-offline"><div><b>Browser preview</b><br>Open Luma as a desktop app to browse websites here. The browser panel uses Chromium inside the packaged app.</div></div></div></aside>
    </div>`;
  }

  private renderConversations(): string {
    return this.conversations.map(conversation => `<button class="conversation ${conversation.id === this.activeId ? 'active' : ''}" data-conversation="${conversation.id}"><span class="conversation-title">${escapeHtml(conversation.title)}</span><span class="conversation-delete" data-delete="${conversation.id}" aria-label="Delete ${escapeHtml(conversation.title)}">×</span></button>`).join('');
  }

  private renderMessages(): string {
    const messages = this.active.messages;
    if (!messages.length) return `<div class="empty-chat"><div class="orb">✦</div><h1>Private, capable, yours.</h1><p>Luma is a local AI chat and browser. Install its compact open model once, then chat without an account or AI service.</p><div class="suggestions"><button class="suggestion" data-suggest="Explain quantum computing simply">Explain a topic</button><button class="suggestion" data-suggest="Help me plan my week">Plan my week</button><button class="suggestion" data-suggest="Write a friendly email">Draft an email</button></div></div>`;
    return messages.map(message => `<article class="message ${message.role}"><span class="avatar">${message.role === 'assistant' ? 'L' : 'You'}</span><div><div class="bubble">${escapeHtml(message.text)}</div><div class="message-time">${time(message.at)}</div></div></article>`).join('');
  }

  private bind(): void {
    $('#new-chat').addEventListener('click', () => { this.newConversation(); this.render(); this.bind(); });
    $('#toggle-browser').addEventListener('click', () => { this.browserVisible = !this.browserVisible; this.render(); this.bind(); });
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
    if (!text || this.generating) return;
    input.value = ''; this.resizeComposer(input);
    const conversation = this.active;
    conversation.messages.push({ id: id(), role: 'user', text, at: Date.now() });
    conversation.title = conversation.messages.filter(message => message.role === 'user')[0]?.text.slice(0, 34) || 'New conversation';
    this.persist(); this.render(); this.bind();
    this.generating = true;
    const messageArea = $('#messages');
    const working = document.createElement('article'); working.className = 'message assistant'; working.innerHTML = '<span class="avatar">L</span><div><div class="bubble">Thinking locally…</div></div>'; messageArea.append(working); messageArea.scrollTop = messageArea.scrollHeight;
    try {
      await this.prepareModel();
      if (!this.generator) throw new Error('The local model is not ready yet.');
      const history = conversation.messages.slice(-6).map(message => `${message.role === 'user' ? 'User' : 'Luma'}: ${message.text}`).join('\n');
      const prompt = `Give a useful, direct response.\n${history}\nLuma:`;
      const output = await this.generator(prompt, { max_new_tokens: 160, temperature: 0.7, repetition_penalty: 1.15 });
      const answer = output[0]?.generated_text?.trim();
      if (!answer) throw new Error('The local model returned no text. Try a shorter message.');
      conversation.messages.push({ id: id(), role: 'assistant', text: answer, at: Date.now() });
      this.persist(); this.render(); this.bind();
    } catch (error) {
      working.remove();
      this.toast(error instanceof Error ? error.message : 'The message could not be generated.', 'error');
    } finally { this.generating = false; }
  }

  private bindBrowser(): void {
    const web = document.querySelector('#web') as unknown as { loadURL?: (url: string) => void; goBack?: () => void; goForward?: () => void; reload?: () => void; getURL?: () => string; addEventListener?: (name: string, listener: () => void) => void };
    const address = $('#address') as HTMLInputElement;
    const unavailable = $('#browser-unavailable');
    const useBrowser = (value = address.value): void => {
      const url = /^https?:\/\//i.test(value) ? value : `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
      if (web.loadURL) { web.loadURL(url); address.value = url; } else unavailable.classList.add('visible');
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
      web.addEventListener('did-navigate', () => { const current = web.getURL?.(); if (current) address.value = current; });
      web.addEventListener('did-navigate-in-page', () => { const current = web.getURL?.(); if (current) address.value = current; });
    } else unavailable.classList.add('visible');
  }

  private toast(text: string, kind = ''): void {
    document.querySelector('.toast')?.remove();
    const toast = document.createElement('div'); toast.className = `toast ${kind}`; toast.textContent = text; document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4600);
  }
}

new LumaApp().init();
