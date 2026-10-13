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
import type { ApiPolicy, ApiUser } from './api';
import type { ChatLeaveContext } from './chatTypes';
import './ChatAssistant.css';

type ChatMessage = { id: number; role: 'assistant' | 'user'; text: string; time: string };

type ChatAssistantProps = {
  user: ApiUser;
  policies: ApiPolicy[];
  leaveContext: ChatLeaveContext;
};

const initialMessage: ChatMessage = {
  id: 1,
  role: 'assistant',
  text: 'Hi there! I’m Nori, your Northstar people guide. Think of me as a friendly first stop for leave questions, workplace policies, and finding your way around.',
  time: 'Just now',
};

function responseFor(text: string, user: ApiUser, policies: ApiPolicy[], leaveContext: ChatLeaveContext) {
  const query = text.toLowerCase();
  const mine = leaveContext.requests.filter((request) => request.userId === user.userId);
  const currentYear = new Date().getFullYear().toString();
  const today = new Date().toISOString().slice(0, 10);

  if (query.includes('balance') || query.includes('remaining') || query.includes('left')) {
    if (user.role !== 'employee') {
      return `I can help with employee-specific leave questions, but I don’t have an organization-wide balance report in this preview. There are ${leaveContext.pendingCount} requests waiting for review.`;
    }
    if (!policies.length)
      return 'Your HR team has not added active leave policies yet, so I can’t calculate a balance just yet.';
    const summary = policies.map((policy) => {
      const used = mine
        .filter(
          (request) =>
            request.policyId === policy.policyId &&
            request.status === 'approved' &&
            request.startDate.startsWith(currentYear),
        )
        .reduce((total, request) => total + request.requestedDays, 0);
      const left = policy.annualAllowanceDays === null ? null : Math.max(0, policy.annualAllowanceDays - used);
      return `${policy.name}: ${left === null ? 'no fixed annual allowance' : `${left} days remaining (${used} approved)`}`;
    });
    return `Here’s what I can see from your current policies:\n${summary.map((item) => `• ${item}`).join('\n')}\n\nThis preview totals approved calendar days; your HR team can confirm local workday and holiday rules.`;
  }

  if (query.includes('policy')) {
    if (!policies.length)
      return 'There are no active leave policies configured yet. Your HR team can add them when the policy setup is ready.';
    return `Your active leave options are:\n${policies.map((policy) => `• ${policy.name}${policy.annualAllowanceDays === null ? '' : ` — ${policy.annualAllowanceDays} days per year`}${policy.requiresDocumentation ? ' · documentation may be required' : ''}`).join('\n')}\n\nFor eligibility or local rules, check with your HR team.`;
  }

  if (query.includes('upcoming') || query.includes('next leave') || query.includes('when am i off')) {
    const upcoming = mine
      .filter(
        (request) => request.startDate >= today && request.status !== 'rejected' && request.status !== 'cancelled',
      )
      .sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
    if (!upcoming)
      return 'I don’t see any upcoming leave requests for you. When you’re ready, open My leave and choose “Request time off.”';
    return `Your next ${upcoming.status} request is ${upcoming.leaveName}, ${upcoming.startDate} to ${upcoming.endDate} (${upcoming.requestedDays} ${upcoming.requestedDays === 1 ? 'day' : 'days'}).`;
  }

  if (query.includes('request') || query.includes('apply') || query.includes('time off') || query.includes('leave')) {
    if (user.role !== 'employee') {
      return `You have ${leaveContext.pendingCount} leave request${leaveContext.pendingCount === 1 ? '' : 's'} waiting for review. Open Requests to see the queue. HR and Super Admin can approve or reject pending requests; employees cannot review their own requests.`;
    }
    return 'To request time off, open My leave or choose “Request time off” from your dashboard. Select an active policy and dates, add an optional note, then send it. It will appear as Pending while it awaits review.';
  }

  if (query.includes('hello') || query.includes('hi ') || query === 'hi' || query.includes('hey')) {
    return `Hey ${user.name.split(' ')[0]}! What can I help you find today? You can ask about leave balances, policies, or your next time off.`;
  }

  return 'I’m Nori’s interface preview—my chat service is not connected yet. Try one of the suggestions below, or ask about leave, balances, upcoming time off, or policies.';
}

function currentTime() {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
}

export function ChatAssistant({ user, policies, leaveContext }: ChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [isThinking, setIsThinking] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
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

  function sendMessage(value: string) {
    const text = value.trim();
    if (!text || isThinking) return;
    setShowWelcome(false);
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text, time: currentTime() }]);
    setInput('');
    setIsThinking(true);
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'assistant',
          text: responseFor(text, user, policies, leaveContext),
          time: currentTime(),
        },
      ]);
      setIsThinking(false);
    }, 800);
  }

  function resetConversation() {
    setMessages([{ ...initialMessage, id: Date.now() }]);
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
                    {message.text.split('\n').map((line, index) => (
                      <span key={`${message.id}-${index}`}>
                        {line}
                        {index < message.text.split('\n').length - 1 && <br />}
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
                <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>
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
                sendMessage(input);
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
            <span>PREVIEW</span>
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
