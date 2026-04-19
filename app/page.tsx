"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Sender = "A" | "B";

type ChatMessage = {
  id: string;
  sender: Sender;
  text: string;
  translatedText: string;
  createdAt: string;
  pending?: boolean;
};

const seedMessages: ChatMessage[] = [
  {
    id: "seed-1",
    sender: "B",
    text: "Привет! Как дела?",
    translatedText: "안녕하세요! 어떻게 지내세요?",
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-2",
    sender: "A",
    text: "잘 지내고 있어요! 오늘 날씨가 너무 좋네요.",
    translatedText: "Я в порядке! Сегодня очень хорошая погода.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "seed-3",
    sender: "B",
    text: "Да, здесь тоже солнечно! Чем ты занимаешься?",
    translatedText: "네, 여기도 맑아요! 오늘 뭐 하고 있어요?",
    createdAt: new Date().toISOString(),
  },
];

function getTimeLabel(iso: string) {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getNowIso() {
  return new Date().toISOString();
}

function getReadStorageKey(user: Sender) {
  return `chat_last_read_at_${user}`;
}

export default function Home() {
  const [selectedUser, setSelectedUser] = useState<Sender>("A");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [password, setPassword] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [unreadMarkerMessageId, setUnreadMarkerMessageId] = useState<string | null>(null);

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const forceScrollToBottomRef = useRef(false);
  const forceScrollToMessageIdRef = useRef<string | null>(null);
  const lastServerMessageCountRef = useRef(0);

  const counterpart = useMemo(
    () =>
      selectedUser === "A"
        ? { initials: "КР", name: "Крис", subtitle: "🇷🇺 Русский · Перевод DeepL" }
        : { initials: "СХ", name: "Сынхун (승훈)", subtitle: "🇰🇷 Корейский · Перевод DeepL" },
    [selectedUser],
  );

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { authenticated?: boolean; user?: Sender };
        if (data.authenticated && data.user) {
          setSelectedUser(data.user);
          setIsLoggedIn(true);
        }
      } catch {
        // Ignore session check errors and show login form.
      } finally {
        setIsCheckingAuth(false);
      }
    };

    void checkSession();
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const installedHandler = () => setIsInstalled(true);

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const onInstallClick = async () => {
    if (!installPrompt) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (installPrompt as any).prompt();
    if (result?.outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    type MessageDto = {
      id: string;
      sender: Sender;
      text: string;
      translatedText: string;
      createdAt: string;
    };

    const fetchMessages = async (isInitial: boolean) => {
      if (isInitial) setIsLoadingHistory(true);
      try {
        const response = await fetch("/api/messages", { cache: "no-store" });
        if (!response.ok) return;

        const data = (await response.json()) as { messages?: MessageDto[] };

        if (data.messages !== undefined) {
          if (isInitial) {
            const key = getReadStorageKey(selectedUser);
            const lastReadAt = localStorage.getItem(key);
            const firstUnread = lastReadAt
              ? data.messages.find((msg) => new Date(msg.createdAt).getTime() > new Date(lastReadAt).getTime())
              : null;

            if (firstUnread) {
              setUnreadMarkerMessageId(firstUnread.id);
              forceScrollToMessageIdRef.current = firstUnread.id;
            } else {
              setUnreadMarkerMessageId(null);
              forceScrollToBottomRef.current = true;
            }
          } else {
            const hasNewServerMessage = data.messages.length > lastServerMessageCountRef.current;
            if (hasNewServerMessage) {
              forceScrollToBottomRef.current = true;
            }
          }

          lastServerMessageCountRef.current = data.messages.length;

          setMessages((prev) => {
            // pending 메시지는 유지하고 DB 데이터로 병합
            const pendingIds = new Set(prev.filter((m) => m.pending).map((m) => m.id));
            const pending = prev.filter((m) => pendingIds.has(m.id));
            return [...data.messages!, ...pending];
          });
        }
      } catch {
        // 연결 실패 시 현재 상태 유지
      } finally {
        if (isInitial) setIsLoadingHistory(false);
      }
    };

    // 최초 로딩
    void fetchMessages(true);

    // 3초마다 폴링
    const intervalId = setInterval(() => void fetchMessages(false), 3000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn, selectedUser]);

  const saveLastReadAt = useCallback(() => {
    if (!messages.length) return;

    const lastStableMessage = [...messages].reverse().find((m) => !m.pending);
    if (!lastStableMessage) return;

    localStorage.setItem(getReadStorageKey(selectedUser), lastStableMessage.createdAt);
  }, [messages, selectedUser]);

  useEffect(() => {
    if (!isLoggedIn || !messagesRef.current) {
      return;
    }

    const onScroll = () => {
      const el = messagesRef.current;
      if (!el) return;

      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      if (isNearBottom) {
        saveLastReadAt();
        setUnreadMarkerMessageId(null);
      }
    };

    const el = messagesRef.current;
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [isLoggedIn, messages, selectedUser, saveLastReadAt]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;

    const targetMessageId = forceScrollToMessageIdRef.current;
    if (targetMessageId) {
      const target = el.querySelector<HTMLElement>(`[data-message-id='${targetMessageId}']`);
      if (target) {
        target.scrollIntoView({ block: "center" });
      }
      forceScrollToMessageIdRef.current = null;
      return;
    }

    if (forceScrollToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      forceScrollToBottomRef.current = false;
      saveLastReadAt();
      return;
    }

    // 맨 아래 40px 이내에 있거나 pending 메시지가 있을 때만 자동 스크롤
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const hasPending = messages.some((m) => m.pending);
    if (isNearBottom || hasPending) {
      el.scrollTop = el.scrollHeight;
      saveLastReadAt();
      setUnreadMarkerMessageId(null);
    }
  }, [messages, saveLastReadAt]);

  const onLogin = async () => {
    if (!password.trim()) {
      alert("Пожалуйста, введите пароль");
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user: selectedUser, password }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Ошибка входа");
      }

      const data = (await response.json()) as { ok?: boolean; user?: Sender };
      if (data.user) {
        setSelectedUser(data.user);
      }

      setIsLoggedIn(true);
      setPassword("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка входа";
      alert(message);
    }
  };

  const onResizeInput = () => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text) {
      return;
    }

    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sender: selectedUser,
      text,
      translatedText: selectedUser === "A" ? "Перевод на русский..." : "Перевод на корейский...",
      createdAt: getNowIso(),
      pending: true,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sender: selectedUser, text }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as {
          error?: string;
          details?: string;
        };

        throw new Error(errorData.details || errorData.error || "Failed to send");
      }

      const data = (await response.json()) as {
        message: {
          id: string;
          sender: Sender;
          text: string;
          translatedText: string;
          createdAt: string;
        };
      };

      setMessages((prev) =>
        prev.map((m) => (m.id === tempMessage.id ? { ...data.message, pending: false } : m)),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Неизвестная ошибка";

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempMessage.id
            ? {
                ...m,
                pending: false,
                translatedText: `Ошибка отправки: ${errorMessage}`,
              }
            : m,
        ),
      );
    }
  };

  if (isCheckingAuth) {
    return (
      <div id="loginScreen">
        <div className="login-card">
          <p className="login-desc">Проверка сессии...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div id="loginScreen">
        <div className="login-card">
          <div className="logo">
            <div className="logo-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 12a7 7 0 0114 0" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                <circle cx="12" cy="15.5" r="3.5" fill="white" />
                <path
                  d="M8.5 15.5L5 20M15.5 15.5L19 20"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <span className="logo-name">Bilingual Chat</span>
          </div>

          <p className="login-desc">Не страшно, если вы говорите на разных языках. Сообщения переводятся автоматически.</p>

          <div className="tabs">
            <button
              className={`tab ${selectedUser === "A" ? "active" : ""}`}
              onClick={() => setSelectedUser("A")}
              type="button"
            >
              Пользователь A (Корейский)
            </button>
            <button
              className={`tab ${selectedUser === "B" ? "active" : ""}`}
              onClick={() => setSelectedUser("B")}
              type="button"
            >
              Пользователь B (Русский)
            </button>
          </div>

          <p className="field-label">Пароль</p>
          <input
            className="pw-input"
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void onLogin();
              }
            }}
          />

          <button className="login-btn" onClick={() => void onLogin()} type="button">
            Войти
          </button>
          <p className="login-hint">Вход по паролю без регистрации</p>
        </div>
      </div>
    );
  }

  return (
    <div id="chatApp">
      <div className="chat-header">
        <div className="hdr-av">{counterpart.initials}</div>
        <div className="hdr-info">
          <div className="hdr-name">{counterpart.name}</div>
          <div className="hdr-sub">{counterpart.subtitle}</div>
        </div>
        <span className="hdr-badge">KO ↔ RU</span>
        {!isInstalled && installPrompt ? (
          <button className="install-btn" onClick={() => void onInstallClick()} type="button" title="Добавить на главный экран">
            📲
          </button>
        ) : null}
      </div>

      <div className="messages" ref={messagesRef}>
        <div className="date-div">Сегодня</div>

        {isLoadingHistory && (
          <div className="date-div" style={{ marginTop: 8 }}>
            Загрузка истории...
          </div>
        )}

        {messages.map((message) => {
          const mine = message.sender === selectedUser;
          const avatarClass = mine ? "a" : "b";
          const avatarText = mine ? (selectedUser === "A" ? "Я" : "Я") : counterpart.initials;
          const trFlag = message.sender === "A" ? "🇷🇺" : "🇰🇷";

          return (
            <div key={message.id}>
              {unreadMarkerMessageId === message.id ? (
                <div className="read-marker">Вы прочитали до этого места</div>
              ) : null}

              <div className={`msg-row ${mine ? "out" : "in"}`} data-message-id={message.id}>
                <div className={`msg-av ${avatarClass}`}>{avatarText}</div>
                <div className="bubble-wrap">
                  <div className={`bubble ${mine ? "out" : "in"}`}>
                    <div className="orig">{message.text}</div>
                    <div className="tr-line">
                      <span>{trFlag}</span>
                      <span className="tr-text">{message.translatedText}</span>
                    </div>
                  </div>
                  <div className="msg-time">
                    {getTimeLabel(message.createdAt)}
                    {mine ? <span className="checks"> {message.pending ? "✓" : "✓✓"}</span> : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="input-area">
        <div className="auto-tr-bar">
          <span>⚡</span>
          <span>Автоперевод включен</span>
          <span className="auto-pill">RU ↔ KO · DeepL</span>
        </div>

        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="msg-input"
            value={input}
            placeholder="Введите сообщение..."
            rows={1}
            onChange={(event) => {
              setInput(event.target.value);
              onResizeInput();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSend();
              }
            }}
          />

          <button className="send-btn" onClick={() => void onSend()} type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 9L16 9M10 3l6 6-6 6"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
