import type { SpeechSegment } from '@/types/lesson';

const en = (text: string): SpeechSegment => ({ text, lang: 'en' });
const es = (text: string): SpeechSegment => ({ text, lang: 'es' });

export const lesson02Segments: Record<string, SpeechSegment[]> = {
  'turn-1-full': [
    en("Half of English vocabulary comes from Latin, and Spanish is basically modern Latin. English words ending in A-L work directly in Spanish — stress the final syllable. For example, the English word normal — in Spanish, that's"),
    es('normal.')
  ],
  'turn-4-full': [
    es('Metal.'),
    en('Good. Spanish vowels stay short and steady: ah... eh... ee... oh... ooh.')
  ],
  'turn-5-full': [
    en("The word for 'is' in Spanish is"),
    es('es.'),
    en("E-S. And this also means 'it is', 'she is', 'he is', or even 'you are' when talking to somebody formally.")
  ],
  'turn-8-full': [
    es('Es normal.'),
    en("Good. One tip: in English, the S in 'is' is pronounced like a Z. In Spanish, always keep it as a clean S sound.")
  ],
  'turn-11-full': [
    es('Legal.'),
    en('Good.')
  ],
  'turn-14-full': [
    es('Es legal.'),
    en('Good.')
  ],
  'turn-17-full': [
    es('Ilegal.'),
    en("Good. In Spanish the I is like 'ink' and the E is like 'elephant'."),
    es('Ilegal.')
  ],
  'turn-20-full': [
    es('Es ilegal.'),
    en('Good.')
  ],
  'turn-21-full': [
    en("What if you want to say 'he is liberal'? You do not need the word for 'he' if you know who you are talking about. You can just use"),
    es('es.'),
    en('How would you say it?')
  ],
  'turn-23-full': [
    es('Es liberal.'),
    en('Good.')
  ],
  'turn-27-full': [
    es('Natural.'),
    en('Good. Remember to pronounce every letter as written - A sounds like ah, and U sounds like oo.'),
    es('Natural.'),
    en('And stress the final syllable.')
  ],
  'turn-28-full': [
    en("If you want to say 'it isn't' or 'it's not', the word for 'not' or 'don't' is the same as the word for 'no'. And the word for 'no' in Spanish is the same as English, but you pronounce it like Spanish:"),
    es('no.')
  ],
  'turn-29-full': [
    en("You put 'no' before 'es' to say 'it is not'. How would you say 'it is not'?")
  ],
  'turn-31-full': [
    es('No es.'),
    en("Good. So now we can say things like 'it's not normal'.")
  ],
  'turn-34-full': [
    es('No es normal.'),
    en('Good.')
  ],
  'turn-37-full': [
    es('Ideal.'),
    en('Good.')
  ],
  'turn-40-full': [
    es('Es ideal.'),
    en('Good.')
  ],
  'turn-43-full': [
    es('No es ideal.'),
    en('Perfect.')
  ],
  'turn-46-full': [
    es('Fatal.'),
    en('Good.')
  ],
  'turn-49-full': [
    es('Colonial.'),
    en('Good.')
  ],
  'turn-52-full': [
    es('Cultural.'),
    en('Good. Notice how each vowel gets its own clean sound.'),
    es('Cultural.')
  ],
  'turn-55-full': [
    es('Anual.'),
    en('Very nice.')
  ],
  'turn-58-full': [
    es('Dental.'),
    en('Good. Tooth in Spanish is'),
    es('diente.'),
    en('So this is coming from dental. If you look up tooth in the dictionary and find'),
    es('diente,'),
    en('rather than treating it as random vocabulary to memorize, you can relate it back to dental.')
  ],
  'turn-61-full': [
    es('Verbal.'),
    en("Good. So knowing 'verbal', you can probably guess the word for 'verb' in Spanish.")
  ],
  'turn-64-full': [
    es('Verbo.'),
    en("Good. With vocabulary, it's okay to guess based on patterns. If you're a little off, a native speaker will usually still understand you, and then you can adjust. That's one of the fastest ways to build vocabulary.")
  ]
};
