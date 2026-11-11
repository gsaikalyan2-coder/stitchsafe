"use client";

import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare, Clock, User, Scissors } from "lucide-react";

interface MessageItem {
  id: string;
  senderId: string | null;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

interface OrderChatProps {
  orderId: string;
  currentUserId: string;
  otherPartyName: string;
  isTailor: boolean;
}

export function OrderChat({
  orderId,
  currentUserId,
  otherPartyName,
  isTailor,
}: OrderChatProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgCountRef = useRef(0);

  // Quick suggestion prompts
  const quickSuggestions = isTailor
    ? [
        "Fabric received & inspected. Starting the pattern cut.",
        "Measurements verified against the checklist.",
        "Stitching in progress! Will upload finished work photos shortly.",
        "Garment is packed and ready for dispatch.",
      ]
    : [
        "Hi! Please check if we can add gold piping along the border.",
        "Can we confirm the overall length should be 42 inches?",
        "Looks great in the photos! Looking forward to delivery.",
        "Received the parcel. Trying on for fit confirmation now.",
      ];

  // Poll for messages every 3 seconds
  useEffect(() => {
    let isMounted = true;

    async function fetchMessages() {
      try {
        const res = await fetch(`/api/orders/${orderId}/messages`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { messages: MessageItem[] };
          if (isMounted && data.messages) {
            setMessages(data.messages);
          }
        }
      } catch {
        // network polling failure is non-fatal
      }
    }

    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orderId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendMessage(textToSend?: string) {
    const text = (textToSend ?? inputText).trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    // Optimistic UI update
    msgCountRef.current += 1;
    const tempId = `temp-${msgCountRef.current}`;
    const optimisticMsg: MessageItem = {
      id: tempId,
      senderId: currentUserId,
      role: "USER",
      content: text,
      createdAt: "Just now",
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText("");

    try {
      const res = await fetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Failed to send message");
      }
      const data = (await res.json()) as { message: MessageItem };
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error sending message");
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-[520px]">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800">
            <MessageSquare size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>Order Chat</span>
              <span className="text-xs font-normal text-slate-400">• with {otherPartyName}</span>
            </h3>
            <p className="text-[11px] text-slate-500">Live communication for garment updates &amp; clarifications</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <MessageSquare size={36} className="mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No messages yet</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Start a conversation regarding measurements, stitching updates, or design queries.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isMe ? "justify-end" : "justify-start"}`}
              >
                {!isMe && (
                  <div className="h-7 w-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 shrink-0 text-xs mt-0.5">
                    {isTailor ? <User size={13} /> : <Scissors size={13} />}
                  </div>
                )}
                <div className={`max-w-[80%] space-y-1 ${isMe ? "items-end" : "items-start"}`}>
                  <div className={`text-[10px] font-bold px-1 ${isMe ? "text-right text-slate-400" : "text-left text-slate-600"}`}>
                    {isMe ? "You" : otherPartyName}
                  </div>
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isMe
                        ? "bg-slate-900 text-white rounded-tr-none"
                        : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-[10px] text-slate-400 px-1 ${
                      isMe ? "justify-end" : "justify-start"
                    }`}
                  >
                    <Clock size={10} />
                    <span>
                      {msg.createdAt && !isNaN(Date.parse(msg.createdAt))
                        ? new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Just now"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-white flex flex-wrap gap-1.5">
        {quickSuggestions.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => sendMessage(item)}
            disabled={sending}
            className="text-[11px] whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0 disabled:opacity-50 font-medium"
          >
            + {item.length > 40 ? item.slice(0, 38) + "…" : item}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage();
        }}
        className="p-3 border-t border-slate-100 bg-white flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Message ${otherPartyName}…`}
          className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !inputText.trim()}
          className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-40 transition-colors shadow-sm"
        >
          {sending ? "Sending…" : <Send size={15} />}
        </button>
      </form>
      {error && <p className="text-xs text-rose-600 px-4 pb-2">{error}</p>}
    </div>
  );
}
