"use client";

import { useEffect, useState } from "react";
import { PASSAGE_SIZES } from "@/lib/settings";
import { LANGUAGES, type Settings } from "@/lib/types";

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
};

export default function SettingsPanel({ settings, onChange, onClose }: Props) {
  const [models, setModels] = useState<{ name: string; label: string }[]>([]);
  const [modelError, setModelError] = useState<string | null>(null);
  const [serverDefault, setServerDefault] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/models")
      .then((r) => r.json())
      .then((data) => {
        if (!live) return;
        setModels(data.models ?? []);
        setServerDefault(data.current ?? "");
        if (data.error) setModelError(data.error as string);
      })
      .catch(() => live && setModelError("Could not reach the Gemini API."));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-16">
      <button type="button" aria-label="Close settings" className="fixed inset-0" onClick={onClose} />
      <div className="rise relative w-full max-w-lg rounded-xl border border-rule bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="text-sm text-muted hover:text-ink">
            done
          </button>
        </div>

        <div className="space-y-6">
          <label className="block">
            <span className="text-sm font-medium">Language you are reading</span>
            <select
              value={settings.lang}
              onChange={(event) => onChange({ ...settings, lang: event.target.value })}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-faint">
              Books already on your shelf keep the language they were added with.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">How much to translate at once</span>
            <select
              value={settings.maxChars}
              onChange={(event) => onChange({ ...settings, maxChars: Number(event.target.value) })}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              {PASSAGE_SIZES.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-faint">
              Applies to books you add from now on.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Model</span>
            <select
              value={settings.model}
              onChange={(event) => onChange({ ...settings, model: event.target.value })}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 text-sm"
            >
              <option value="">
                Server default{serverDefault ? ` (${serverDefault})` : ""}
              </option>
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
            {modelError ? (
              <span className="mt-1 block text-xs text-bad">{modelError}</span>
            ) : (
              <span className="mt-1 block text-xs text-faint">
                Listed live from your API key. A flash model is plenty for grading; a pro model
                catches finer nuance and costs more.
              </span>
            )}
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.showContext}
              onChange={(event) => onChange({ ...settings, showContext: event.target.checked })}
              className="mt-1"
            />
            <span>
              <span className="text-sm font-medium">Let me see the previous passage</span>
              <span className="mt-0.5 block text-xs text-faint">
                Also gives the grader that context, so continuity is not marked as invention.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
