'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'es' | 'en';

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
  messages: Record<string, any>;
  loadMessages: (language: Language) => Promise<void>;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'es',
      messages: {},

      setLanguage: async (language: Language) => {
        set({ language });
        // Cargar mensajes del nuevo idioma
        const messages = await import(`@/messages/${language}.json`).then(
          (m) => m.default
        );
        set({ messages });
      },

      loadMessages: async (language: Language) => {
        const messages = await import(`@/messages/${language}.json`).then(
          (m) => m.default
        );
        set({ messages });
      },
    }),
    {
      name: 'language-storage',
    }
  )
);
