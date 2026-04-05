import type { SpeechSegment } from '@/types/lesson';

const en = (text: string): SpeechSegment => ({ text, lang: 'en' });
const es = (text: string): SpeechSegment => ({ text, lang: 'es' });

export const lesson02Segments: Record<string, SpeechSegment[]> = {
  'turn-3-full': [
    en('One of these rules is that words ending in A-L tend to come from Latin so we can make them Spanish. For example, normal in Spanish is'),
    es('normal,'),
    en('but we stress the end:'),
    es('normal.')
  ],
  'turn-6-full': [
    es('Metal.'),
    en("Good. To get a perfect accent in Spanish, pronounce the vowels exactly as they are written. In Spanish, the vowels are very clean: A is 'ah', E is 'eh', I is 'ee', O is 'oh', U is 'oo'.")
  ],
  'turn-7-full': [
    en("The word for 'is' in Spanish is"),
    es('es.'),
    en("E-S. And this also means 'it is', 'she is', 'he is', or even 'you are' when talking to somebody formally.")
  ],
  'turn-10-full': [
    es('Es normal.'),
    en("Good. One tip: in English, the S in 'is' is pronounced like a Z. In Spanish, always keep it as a clean S sound.")
  ],
  'turn-13-full': [
    es('Legal.'),
    en('Good.')
  ],
  'turn-16-full': [
    es('Es legal.'),
    en('Good.')
  ],
  'turn-19-full': [
    es('Ilegal.'),
    en("Good. In Spanish the I is like 'ink' and the E is like 'elephant'."),
    es('Ilegal.')
  ],
  'turn-22-full': [
    es('Es ilegal.'),
    en('Good.')
  ],
  'turn-23-full': [
    en("What if you want to say 'he is liberal'? You do not need the word for 'he' if you know who you are talking about. You can just use"),
    es('es.'),
    en('How would you say it?')
  ],
  'turn-25-full': [
    es('Es liberal.'),
    en('Good.')
  ],
  'turn-29-full': [
    es('Natural.'),
    en("Good. Remember to pronounce every letter as written - A is 'ah', U is 'oo'."),
    es('Natural.'),
    en('And stress the final syllable.')
  ],
  'turn-30-full': [
    en("If you want to say 'it isn't' or 'it's not', the word for 'not' or 'don't' is the same as the word for 'no'. And the word for 'no' in Spanish is the same as English, but you pronounce it like Spanish:"),
    es('no.')
  ],
  'turn-31-full': [
    en("You put 'no' before 'es' to say 'it is not'. How would you say 'it is not'?")
  ],
  'turn-33-full': [
    es('No es.'),
    en("Good. So now we can say things like 'it's not normal'.")
  ],
  'turn-36-full': [
    es('No es normal.'),
    en('Good.')
  ],
  'turn-39-full': [
    es('Ideal.'),
    en('Good.')
  ],
  'turn-42-full': [
    es('Es ideal.'),
    en('Good.')
  ],
  'turn-45-full': [
    es('No es ideal.'),
    en('Perfect.')
  ],
  'turn-48-full': [
    es('Fatal.'),
    en('Good.')
  ],
  'turn-51-full': [
    es('Colonial.'),
    en('Good.')
  ],
  'turn-54-full': [
    es('Cultural.'),
    en('Good. Notice how each vowel gets its own clean sound.'),
    es('Cultural.')
  ],
  'turn-57-full': [
    es('Anual.'),
    en('Very nice.')
  ],
  'turn-60-full': [
    es('Dental.'),
    en('Good. Tooth in Spanish is'),
    es('diente.'),
    en('So this is coming from dental. If you look up tooth in the dictionary and find'),
    es('diente,'),
    en('rather than treating it as random vocabulary to memorize, you can relate it back to dental.')
  ],
  'turn-63-full': [
    es('Verbal.'),
    en("Good. So knowing 'verbal', you can probably guess the word for 'verb' in Spanish.")
  ],
  'turn-66-full': [
    es('Verbo.'),
    en("Good. With vocabulary, it's okay to guess based on patterns. If you're a little off, a native speaker will usually still understand you, and then you can adjust. That's one of the fastest ways to build vocabulary.")
  ]
};
