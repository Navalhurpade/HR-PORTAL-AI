import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  Command,
  Maximize2,
  Minimize2,
  Plus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { api, type ApiUser, type ChatTurn } from './api';
import './ChatAssistant.css';

type ChatMessage = { id: number; role: 'assistant' | 'user'; text: string; time: string };
type ChatAssistantProps = { user: ApiUser };

const initialMessage: ChatMessage = {
  id: 1,
  role: 'assistant',
  text: 'Hi there! I’m Nori, your Northstar people guide. Think of me as a friendly first stop for leave questions, workplace policies, and finding your way around.',
  time: 'Just now',
};

function currentTime() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

export function ChatAssistant({ user }: ChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [isThinking, setIsThinking] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const conversationIdRef = useRef<string>(conversationId);
  const messageSequence = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions =
    user.role === 'employee'
      ? ['How much leave do I have?', 'What are my leave options?', 'How do I request time off?']
      : ['How many requests need review?', 'How do I review a request?', 'What leave policies are active?'];

  useEffect(() => {
    if (isOpen) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      inputRef.current?.focus();
    }
  }, [isOpen, messages, isThinking]);

  async function sendMessage(value: string) {
    const text = value.trim();
    if (!text || isThinking) return;

    setShowWelcome(false);
    const requestConversationId = conversationIdRef.current;
    const history: ChatTurn[] = messages.slice(-12).map((message) => ({
      role: message.role,
      content: message.text,
    }));
    const userMessage: ChatMessage = { id: ++messageSequence.current, role: 'user', text, time: currentTime() };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const result = await api.chat({ message: text, conversationId: requestConversationId, history });
      if (conversationIdRef.current !== requestConversationId) return;
      conversationIdRef.current = result.conversationId;
      setConversationId(result.conversationId);
      setMessages((current) => [
        ...current,
        { id: ++messageSequence.current, role: 'assistant', text: result.message.content, time: currentTime() },
      ]);
    } catch (error) {
      if (conversationIdRef.current !== requestConversationId) return;
      setMessages((current) => [
        ...current,
        {
          id: ++messageSequence.current,
          role: 'assistant',
          text: error instanceof Error ? error.message : 'Nori is temporarily unavailable. Please try again.',
          time: currentTime(),
        },
      ]);
    } finally {
      if (conversationIdRef.current === requestConversationId) setIsThinking(false);
    }
  }

  function resetConversation() {
    const nextConversationId = crypto.randomUUID();
    conversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
    setMessages([{ ...initialMessage, id: ++messageSequence.current }]);
    setShowWelcome(true);
    setInput('');
    setIsThinking(false);
  }

  return (
    <div className={`nori-root ${isExpanded ? 'nori-expanded' : ''}`}>
      {isOpen && (
        <section
          className={`nori-panel ${isExpanded ? 'nori-panel-expanded' : ''}`}
          role="dialog"
          aria-modal={isExpanded}
          aria-label="Nori AI assistant"
        >
          <header className="nori-header">
            <div className="nori-header-orb">
              <Command size={21} />
              <span />
            </div>
            <div className="nori-heading">
              <div className="nori-name-row">
                <h2>Nori</h2>
                <span className="nori-ai-label">AI GUIDE</span>
              </div>
              <div className="nori-online">
                <i /> Your Northstar people guide
              </div>
            </div>
            <div className="nori-header-actions">
              <button type="button" aria-label="New conversation" title="New conversation" onClick={resetConversation}>
                <Plus size={17} />
              </button>
              <button
                type="button"
                aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}
                title={isExpanded ? 'Minimize' : 'Expand'}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                aria-label="Close Nori"
                title="Close"
                onClick={() => {
                  setIsOpen(false);
                  setIsExpanded(false);
                }}
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div className="nori-context">
            <Sparkles size={14} />
            <span>Here for the little things—and the big questions.</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setShowWelcome(false)}>
              <X size={13} />
            </button>
          </div>

          <div className="nori-conversation" aria-live="polite">
            <div className="nori-day-divider">
              <span>YOUR CONVERSATION</span>
            </div>
            {messages.map((message) => (
              <article key={message.id} className={`nori-message nori-message-${message.role}`}>
                {message.role === 'assistant' && (
                  <span className="nori-message-avatar">
                    <Sparkles size={13} />
                  </span>
                )}
                <div className="nori-message-content">
                  <div className="nori-bubble">
                    {message.text.split('\n').map((line, index, lines) => (
                      <span key={`${message.id}-${index}`}>
                        {line}
                        {index < lines.length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                  <span className="nori-message-time">
                    {message.time}
                    {message.role === 'user' && <Check size={12} />}
                  </span>
                </div>
              </article>
            ))}
            {isThinking && (
              <div className="nori-thinking">
                <span className="nori-message-avatar">
                  <Sparkles size={13} />
                </span>
                <div className="nori-typing">
                  <i />
                  <i />
                  <i />
                </div>
                <span className="sr-only">Nori is thinking</span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {showWelcome && (
            <div className="nori-suggestions">
              <div className="nori-suggestions-label">
                <Sparkles size={13} /> A GOOD PLACE TO START
              </div>
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)}>
                  {suggestion}
                  <ArrowUpRight size={13} />
                </button>
              ))}
            </div>
          )}

          <div className="nori-composer-wrap">
            <form
              className="nori-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Nori anything…"
                aria-label="Message Nori"
                maxLength={1000}
              />
              <button type="submit" disabled={!input.trim() || isThinking} aria-label="Send message">
                <Send size={16} />
              </button>
            </form>
            <div className="nori-composer-foot">
              <span>
                <span className="nori-key">↵</span> to send
              </span>
              <span>Keep it kind. Keep it human.</span>
            </div>
          </div>
          <footer className="nori-footer">
            <span>
              <Bot size={13} /> Nori can make mistakes. Check important details with HR.
            </span>
            <span>AI BETA</span>
          </footer>
        </section>
      )}

      {!isExpanded && (
        <button
          type="button"
          className={`nori-launcher ${isOpen ? 'nori-launcher-open' : ''}`}
          aria-label={isOpen ? 'Close Nori assistant' : 'Open Nori AI assistant'}
          onClick={() => {
            setIsOpen(!isOpen);
            setShowWelcome(true);
          }}
        >
          <span className="nori-launcher-aura" />
          <span className="nori-launcher-icon">{isOpen ? <ChevronDown size={23} /> : <Sparkles size={23} />}</span>
          <span className="nori-launcher-copy">
            <b>{isOpen ? 'Close Nori' : 'Ask Nori'}</b>
            <small>{isOpen ? 'Your people guide' : 'Your AI people guide'}</small>
          </span>
          <span className="nori-launcher-ping" />
        </button>
      )}
    </div>
  );
}
