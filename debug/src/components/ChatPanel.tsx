import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon, SentIcon } from "@hugeicons/core-free-icons";
import { api } from "../../../convex/_generated/api.js";
import type { Id } from "../../../convex/_generated/dataModel.js";
import { useSocket } from "../lib/useSocket.js";
import { MarkdownText } from "./MarkdownText.js";

const DEFAULT_CONVERSATION_ID = "debug:imessage";
const STORAGE_KEY = "boop-debug-chat-conversation-id";

function getStoredConversationId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_CONVERSATION_ID;
  } catch {
    return DEFAULT_CONVERSATION_ID;
  }
}

function formatTime(createdAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function formatDate(createdAt: number): string {
  const date = new Date(createdAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

function dateKey(createdAt: number): string {
  return new Date(createdAt).toDateString();
}

export function ChatPanel({ isDark, hidden = false }: { isDark: boolean; hidden?: boolean }) {
  const [conversationId, setConversationId] = useState(getStoredConversationId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useQuery(api.messages.recent, { conversationId, limit: 100 });
  const deleteMessage = useMutation(api.messages.remove);
  const hasMessages = Boolean(messages?.length);

  useSocket((event) => {
    const data = event.data as { conversationId?: string; t?: string; content?: string } | null;
    if (!data || data.conversationId !== conversationId) return;
    if (event.event === "thinking" && data.t) {
      setStreamingText((current) => current + data.t);
    } else if (event.event === "assistant_message" || event.event === "assistant_ack") {
      setStreamingText("");
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, conversationId);
  }, [conversationId]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages?.length, messages?.[messages.length - 1]?.content, sending, streamingText, hidden]);

  const colors = useMemo(
    () =>
      isDark
        ? {
            page: "bg-slate-950",
            border: "border-slate-800",
            header: "bg-slate-950/80",
            text: "text-slate-100",
            muted: "text-slate-500",
            input: "bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600",
            inbound: "bg-slate-900 text-slate-100 border-slate-800",
            system: "bg-slate-900 text-slate-500 border-slate-800",
          }
        : {
            page: "bg-slate-50",
            border: "border-slate-200",
            header: "bg-white/80",
            text: "text-slate-900",
            muted: "text-slate-500",
            input: "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400",
            inbound: "bg-white text-slate-900 border-slate-200",
            system: "bg-white text-slate-500 border-slate-200",
          },
    [isDark],
  );

  async function sendMessage() {
    const content = draft.trim();
    if (!content || sending) return;
    setDraft("");
    setSending(true);
    setError(null);
    setStreamingText("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, content }),
      });
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          message = parsed.error ?? text;
        } catch {
          /* keep raw response text */
        }
        throw new Error(message);
      }
    } catch (err) {
      setDraft(content);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function startNewConversation() {
    setConversationId(`debug:imessage:${Date.now()}`);
    setDraft("");
    setError(null);
    setStreamingText("");
  }

  async function onDeleteMessage(messageId: Id<"messages">) {
    setError(null);
    try {
      await deleteMessage({ messageId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={`h-[calc(100%+2.5rem)] -m-5 ${hidden ? "hidden" : "flex"} flex-col ${colors.page}`}>
      <div
        className={`shrink-0 border-b px-5 py-3 flex items-center gap-3 ${colors.border} ${colors.header}`}
      >
        <div className="min-w-0">
          <h2 className={`text-xs font-semibold uppercase tracking-wider ${colors.muted}`}>
            Chat Simulator
          </h2>
          <p className={`mt-0.5 truncate text-xs ${colors.muted}`}>
            Local test path for the same Boop dispatcher used by Sendblue.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={conversationId}
            onChange={(event) => setConversationId(event.target.value || DEFAULT_CONVERSATION_ID)}
            className={`h-8 w-64 rounded-lg border px-2 text-xs outline-none ${colors.input}`}
            aria-label="Conversation ID"
          />
          <button
            type="button"
            onClick={startNewConversation}
            className={`h-8 rounded-lg border px-3 text-xs font-semibold transition-colors ${
              isDark
                ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                : "border-slate-200 text-slate-700 hover:bg-slate-100"
            }`}
          >
            New
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto debug-scroll px-6 py-5">
        {!hasMessages && (
          <div className={`mx-auto mt-16 max-w-sm rounded-xl border px-4 py-3 text-center text-xs ${colors.system}`}>
            Send a message to test runtime, tools, memory, and cost logging.
          </div>
        )}

        <div className="space-y-3">
          {messages?.map((message, index) => {
            const outbound = message.role === "user";
            const system = message.role === "system";
            const previous = messages[index - 1];
            const showDate = !previous || dateKey(previous.createdAt) !== dateKey(message.createdAt);
            return (
              <div key={message._id}>
                {showDate && (
                  <div className="my-5 flex items-center gap-3">
                    <div className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                    <span className={`text-[11px] font-medium ${colors.muted}`}>
                      {formatDate(message.createdAt)}
                    </span>
                    <div className={`h-px flex-1 ${isDark ? "bg-slate-800" : "bg-slate-200"}`} />
                  </div>
                )}
                <div className={`group flex ${outbound ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[72%] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                      system
                        ? colors.system
                        : outbound
                          ? "bg-blue-500 text-white border-blue-400"
                          : colors.inbound
                    } ${outbound ? "rounded-br-md" : "rounded-bl-md"}`}
                  >
                    {outbound ? (
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    ) : (
                      <MarkdownText text={message.content} isDark={isDark} compact />
                    )}
                    <div
                      className={`mt-1.5 flex items-center justify-end gap-2 text-[10px] ${
                        outbound ? "text-blue-100" : colors.muted
                      }`}
                    >
                      <span>{formatTime(message.createdAt)}</span>
                      <button
                        type="button"
                        onClick={() => void onDeleteMessage(message._id)}
                        className={`rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                          outbound
                            ? "hover:bg-blue-400/60 hover:text-white"
                            : isDark
                              ? "hover:bg-slate-800 hover:text-rose-300"
                              : "hover:bg-slate-100 hover:text-rose-500"
                        }`}
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="flex justify-start">
              <div className={`max-w-[72%] rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm ${colors.inbound}`}>
                {streamingText ? (
                  <MarkdownText text={streamingText} isDark={isDark} compact />
                ) : (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 animate-bounce [animation-delay:240ms]" />
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={onSubmit} className={`shrink-0 border-t p-4 ${colors.border} ${colors.header}`}>
        {error && (
          <div className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
            {error}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Message Boop"
            className={`max-h-28 min-h-10 flex-1 resize-none rounded-xl border px-4 py-2.5 text-sm outline-none ${colors.input}`}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="h-10 w-10 rounded-xl bg-blue-500 text-white font-bold transition-colors hover:bg-blue-400 disabled:bg-zinc-500 disabled:text-zinc-300"
            aria-label="Send message"
          >
            <HugeiconsIcon icon={SentIcon} size={18} className="mx-auto" />
          </button>
        </div>
      </form>
    </div>
  );
}
