import type { SpeechSegment } from '@/types/lesson';

const en = (text: string): SpeechSegment => ({ text, lang: 'en' });
const es = (text: string): SpeechSegment => ({ text, lang: 'es' });

export const lesson02Segments: Record<string, SpeechSegment[]> = {
  // turn index 0: intro part 1
  'turn-1-full': [
    en("English and Spanish are two related languages. English is considered a Germanic language, but roughly half of its vocabulary comes from Latin. We can convert this Latin vocabulary over to Spanish really easily, because Spanish is practically modern Latin.")
  ],
  // turn index 1: intro part 2
  'turn-2-full': [
    en("So we can identify Latin words in English and, with a few simple rules, convert them to Spanish. This gives us around 3,000 words.")
  ],
  // turn index 2: intro part 3 (the AL rule)
  'turn-3-full': [
    en("One of these rules is that words ending in A-L tend to work directly in Spanish. You just stress the final syllable. So for example, the English word normal — in Spanish, that's"),
    es('normal.')
  ],
  // turn index 5: metal feedback + vowels
  'turn-6-full': [
    es('Metal.'),
    en('Good. Spanish has five vowels, and each one always makes the same sound:'),
    es('A, E, I, O, U.'),
    en('Keep them short and steady.')
  ],
  // turn index 6: "es" introduction
  'turn-7-full': [
    en("The word for 'is' in Spanish is"),
    es('es.'),
    en("E-S. And this also means 'it is', 'she is', 'he is', or even 'you are' when talking to somebody formally.")
  ],
  // turn index 9: es normal feedback
  'turn-10-full': [
    es('Es normal.'),
    en("Good. One tip: in English, the S in 'is' is pronounced like a Z. In Spanish, always keep it as a clean S sound.")
  ],
  // turn index 12: legal feedback
  'turn-13-full': [
    es('Legal.'),
    en('Good.')
  ],
  // turn index 15: es legal feedback
  'turn-16-full': [
    es('Es legal.'),
    en('Good.')
  ],
  // turn index 18: ilegal feedback
  'turn-19-full': [
    es('Ilegal.'),
    en("Good. In Spanish the I is like 'ink' and the E is like 'elephant'."),
    es('Ilegal.')
  ],
  // turn index 21: es ilegal feedback
  'turn-22-full': [
    es('Es ilegal.'),
    en('Good.')
  ],
  // turn index 22: "he is liberal" prompt (combined narration+prompt)
  'turn-23-full': [
    en("What if you want to say 'he is liberal'? You do not need the word for 'he' if you know who you are talking about. You can just use"),
    es('es.'),
    en('How would you say it?')
  ],
  // turn index 24: es liberal feedback
  'turn-25-full': [
    es('Es liberal.'),
    en('Good.')
  ],
  // turn index 27: natural feedback
  'turn-29-full': [
    es('Natural.'),
    en('Good. Remember to pronounce every letter as written - A sounds like ah, and U sounds like oo.'),
    es('Natural.'),
    en('And stress the final syllable.')
  ],
  // turn index 28: "no" introduction
  'turn-30-full': [
    en("If you want to say 'it isn't' or 'it's not', the word for 'not' or 'don't' is the same as the word for 'no'. And the word for 'no' in Spanish is the same as English, but you pronounce it like Spanish:"),
    es('no.')
  ],
  // turn index 31: no es feedback
  'turn-33-full': [
    es('No es.'),
    en("Good. So now we can say things like 'it's not normal'.")
  ],
  // turn index 34: no es normal feedback
  'turn-36-full': [
    es('No es normal.'),
    en('Good.')
  ],
  // turn index 37: ideal feedback
  'turn-39-full': [
    es('Ideal.'),
    en('Good.')
  ],
  // turn index 40: es ideal feedback
  'turn-42-full': [
    es('Es ideal.'),
    en('Good.')
  ],
  // turn index 43: no es ideal feedback
  'turn-45-full': [
    es('No es ideal.'),
    en('Perfect.')
  ],
  // turn index 46: fatal feedback
  'turn-48-full': [
    es('Fatal.'),
    en('Good.')
  ],
  // turn index 49: colonial feedback
  'turn-51-full': [
    es('Colonial.'),
    en('Good.')
  ],
  // turn index 52: cultural feedback
  'turn-54-full': [
    es('Cultural.'),
    en('Good. Notice how each vowel gets its own clean sound.'),
    es('Cultural.')
  ],
  // turn index 55: anual feedback
  'turn-57-full': [
    es('Anual.'),
    en('Very nice.')
  ],
  // turn index 58: dental feedback
  'turn-60-full': [
    es('Dental.'),
    en('Good. Tooth in Spanish is'),
    es('diente.'),
    en('So this is coming from dental. If you look up tooth in the dictionary and find'),
    es('diente,'),
    en('rather than treating it as random vocabulary to memorize, you can relate it back to dental.')
  ],
  // turn index 61: verbal feedback
  'turn-63-full': [
    es('Verbal.'),
    en("Good. So knowing 'verbal', you can probably guess the word for 'verb' in Spanish.")
  ],
  // turn index 64: verbo feedback
  'turn-66-full': [
    es('Verbo.'),
    en("Good. With vocabulary, it's okay to guess based on patterns. If you're a little off, a native speaker will usually still understand you, and then you can adjust. That's one of the fastest ways to build vocabulary.")
  ]
};
