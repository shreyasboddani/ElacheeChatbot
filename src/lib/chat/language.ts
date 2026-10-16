import { ELACHEE } from "@/lib/config";

export const CHAT_LANGUAGE_PREFERENCES = ["auto", "en", "es"] as const;

export type ChatLanguagePreference =
  (typeof CHAT_LANGUAGE_PREFERENCES)[number];
export type ChatUiLanguage = "en" | "es";

export function isChatLanguagePreference(
  value: unknown,
): value is ChatLanguagePreference {
  return (
    typeof value === "string" &&
    (CHAT_LANGUAGE_PREFERENCES as readonly string[]).includes(value)
  );
}

export function chatUiLanguage(
  preference: ChatLanguagePreference,
): ChatUiLanguage {
  return preference === "es" ? "es" : "en";
}

export const CHAT_UI_COPY = {
  en: {
    assistant: "Nature Guide",
    officialInformation: "Official Elachee information",
    prototypeBy: "Prototype technology by",
    today: "Today",
    welcome:
      "Hi! I can help you find approved information from Elachee Nature Science Center about visiting, trails, exhibits, programs, events, and more. What would you like to explore?",
    languageSelector: "Response language",
    languageLabel: "Language",
    languageAuto: "Auto",
    languageEnglish: "English",
    languageSpanish: "Español",
    restart: "Restart conversation",
    minimize: "Minimize chat",
    close: "Close chat",
    typing: "The guide is looking through approved Elachee sources",
    privacy:
      "Please do not share Social Security numbers, bank information, medical details, passwords, or private documents in this chat.",
    inputLabel: "Ask the Elachee Nature Guide",
    inputPlaceholder: "Ask about visiting, trails, programs, or events...",
    send: "Send message",
    groundingNote: "Answers require a confirmed official source.",
    suggestedQuestions: "Suggested questions",
    sources: "Sources",
    officialSources: "Official Elachee sources",
    viewSource: "View on the Elachee website",
    assistantMessage: "Assistant message",
    userMessage: "Your message",
    invalidLong:
      "That message is too long to send. Please shorten it and try again.",
    invalidMessage:
      "The chat control could not read that message. Please type your question in the message box and try again.",
    unavailable:
      `The Elachee Nature Guide is temporarily unavailable. Please try again in a moment. If you still need help, call ${ELACHEE.contact.phone} or use the contact page.`,
    sensitiveReplacement: "Sensitive information was not sent.",
    resize:
      "Resize chat. Drag the corner, or use arrow keys while focused.",
    quickActions: [
      {
        label: "Hours: center & trails",
        question:
          "What days and times are Elachee's Visitor Center and exhibits open, separately from Chicopee Woods trail hours? Include admission and parking costs separately.",
      },
      {
        label: "Choose a trail",
        question:
          "Which Chicopee Woods trail suits a short or stroller-friendly walk, and which trails are longer or harder? Are dogs allowed?",
      },
      {
        label: "Programs for my child",
        question:
          "Which Elachee program fits my child's age—Sprouts, Nature Academy, Camp Elachee, or Homeschool Programs—and where can I check current dates and registration?",
      },
      {
        label: "School field trips",
        question:
          "How do Elachee school field trips work for Pre-K through grade 12? What topics and formats are offered, and how does a teacher request a date?",
      },
      {
        label: "Upcoming events",
        question:
          "Which Elachee events have confirmed upcoming dates, and where can I find details or registration?",
      },
      {
        label: "Things to do with kids",
        question:
          "What's there for kids and families to do at Elachee—what exhibits, animal encounters, and outdoor activities are available?",
      },
    ],
  },
  es: {
    assistant: "Guía de Naturaleza",
    officialInformation: "Información oficial de Elachee",
    prototypeBy: "Tecnología prototipo de",
    today: "Hoy",
    welcome:
      "¡Hola! Puedo ayudarte a encontrar información aprobada de Elachee Nature Science Center sobre visitas, senderos, exhibiciones, programas, eventos y más. ¿Qué te gustaría explorar?",
    languageSelector: "Idioma de respuesta",
    languageLabel: "Idioma",
    languageAuto: "Auto",
    languageEnglish: "English",
    languageSpanish: "Español",
    restart: "Reiniciar conversación",
    minimize: "Minimizar chat",
    close: "Cerrar chat",
    typing: "La guía está consultando fuentes aprobadas de Elachee",
    privacy:
      "No compartas números de Seguro Social, información bancaria, datos médicos, contraseñas ni documentos privados en este chat.",
    inputLabel: "Pregúntale a la Guía de Naturaleza de Elachee",
    inputPlaceholder: "Pregunta sobre visitas, senderos, programas o eventos...",
    send: "Enviar mensaje",
    groundingNote: "Las respuestas requieren una fuente oficial confirmada.",
    suggestedQuestions: "Preguntas sugeridas",
    sources: "Fuentes",
    officialSources: "Fuentes oficiales de Elachee",
    viewSource: "Ver en el sitio web de Elachee",
    assistantMessage: "Mensaje del asistente",
    userMessage: "Tu mensaje",
    invalidLong:
      "Ese mensaje es demasiado largo. Acórtalo e inténtalo de nuevo.",
    invalidMessage:
      "El chat no pudo leer ese mensaje. Escribe tu pregunta en el cuadro e inténtalo de nuevo.",
    unavailable:
      `La Guía de Naturaleza de Elachee no está disponible temporalmente. Inténtalo de nuevo en un momento. Si aún necesitas ayuda, llama al ${ELACHEE.contact.phone} o usa la página de contacto.`,
    sensitiveReplacement: "La información confidencial no se envió.",
    resize:
      "Cambiar el tamaño del chat. Arrastra la esquina o usa las flechas del teclado.",
    quickActions: [
      {
        label: "Horarios: centro y senderos",
        question:
          "¿Qué días y a qué horas abren el Centro de Visitantes y las exhibiciones de Elachee, y cuáles son los horarios de los senderos de Chicopee Woods? Incluye por separado los costos de admisión y estacionamiento.",
      },
      {
        label: "Elegir un sendero",
        question:
          "¿Qué sendero de Chicopee Woods conviene para una caminata corta o con cochecito, y qué opciones hay para recorridos más largos? ¿Se permiten perros?",
      },
      {
        label: "Programas por edad",
        question:
          "¿Qué programa de Elachee se ajusta a la edad de mi hijo? Compara Sprouts, Nature Academy, Camp Elachee y Homeschool Programs, y dime dónde consultar las fechas y la inscripción actuales.",
      },
      {
        label: "Excursiones escolares",
        question:
          "¿Cómo son las excursiones escolares de Elachee para Pre-K hasta 12.º grado? ¿Qué temas y formatos ofrecen y cómo puede un docente solicitar una fecha?",
      },
      {
        label: "Próximos eventos",
        question:
          "¿Qué próximos eventos de Elachee tienen fechas confirmadas, y dónde puedo consultar los detalles o la inscripción?",
      },
      {
        label: "Qué hacer con niños",
        question:
          "¿Qué pueden hacer las familias en Elachee, con exhibiciones, animales y actividades al aire libre?",
      },
    ],
  },
} as const;
