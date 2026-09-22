import { FormEvent, useEffect, useRef, useState } from "react";

import { SendIcon } from "@/components/chatbot/Icons";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/limits";
import { CHAT_UI_COPY, type ChatUiLanguage } from "@/lib/chat/language";
import { captureMessageForSubmit } from "@/lib/chat/request";

interface ChatInputProps {
  disabled: boolean;
  onSend: (message: string) => void;
  language?: ChatUiLanguage;
}

export function ChatInput({ disabled, onSend, language = "en" }: ChatInputProps) {
  const copy = CHAT_UI_COPY[language];
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(32, Math.min(input.scrollHeight, 90))}px`;
  }, [message]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messageToSend = captureMessageForSubmit(message);
    if (!messageToSend || disabled) return;
    onSend(messageToSend);
    setMessage("");
    inputRef.current?.focus();
  }

  return (
    <form className="chat-input-form" onSubmit={submit}>
      <label htmlFor="elachee-chat-input" className="sr-only">
        {copy.inputLabel}
      </label>
      <div className="chat-input-field">
        <textarea
          ref={inputRef}
          id="elachee-chat-input"
          aria-describedby="elachee-chat-character-count"
          value={message}
          onChange={(event) =>
            setMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={copy.inputPlaceholder}
          disabled={disabled}
        />
        <span
          id="elachee-chat-character-count"
          className="chat-character-count"
          aria-live="polite"
        >
          {message.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
      <button
        type="submit"
        className="chat-send-button"
        disabled={disabled || !message.trim()}
        aria-label={copy.send}
      >
        <SendIcon />
      </button>
    </form>
  );
}
