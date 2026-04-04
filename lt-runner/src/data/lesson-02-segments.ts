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
    en('Good. To get a perfect accent in Spanish we just need to pronounce all of the vowels exactly as they are written. A, E, I, O, U in Spanish is ah, eh, ee, oh, oo.')
  ],
  'turn-7-full': [
    en("The word for 'is' in Spanish is"),
    es('es.'),
    en("E-S. And this also means 'it is', 'she is', 'he is', or even 'you are' when talking to somebody formally.")
  ],
  'turn-10-full': [
    es('Es normal.'),
    en("And you pronounce the S, which is excellent. English speakers should be aware that maybe they feel themselves pronouncing a Z because many times we have an S in English like in the word 'is' and we pronounce a Z. Be careful to pronounce an S.")
  ],
  'turn-13-reveal': [
    es('Legal.'),
    en('Good.')
  ],
  'turn-15-full': [
    es('Es legal.'),
    en('Good.')
  ],
  'turn-18-full': [
    es('Illegal.'),
    en("Good. In Spanish the I is like 'ink' and the E is like 'elephant'."),
    es('Illegal.')
  ],
  'turn-21-full': [
    es('Es illegal.'),
    en('Good.')
  ],
  'turn-22-full': [
    en("What if you want to say 'he is liberal'? You do not need the word for 'he' if you know who you are talking about. You can just use"),
    es('es.'),
    en('How would you say it?')
  ],
  'turn-24-full': [
    es('Es liberal.'),
    en('Good.')
  ],
  'turn-28-full': [
    es('Natural.'),
    en('Very good. You pronounce a T, A is like ah, U is like oo.'),
    es('Natural.'),
    en('And the accent on the end as well.')
  ],
  'turn-29-full': [
    en("If you want to say 'it isn't' or 'it's not', the word for 'not' or 'don't' is the same as the word for 'no'. And the word for 'no' in Spanish is the same as English, but you pronounce it like Spanish:"),
    es('no.')
  ],
  'turn-30-full': [
    en("You put this before"),
    es("'es'"),
    en("if you want to say 'it is not'. How would that sound? How would you say 'it is not'?")
  ],
  'turn-32-full': [
    es('No es.'),
    en("Good. So now we can say things like 'it's not normal'.")
  ],
  'turn-35-full': [
    es('No es normal.'),
    en('Good.')
  ],
  'turn-38-full': [
    es('Ideal.'),
    en('Good.')
  ],
  'turn-41-full': [
    es('Es ideal.'),
    en('Good.')
  ],
  'turn-44-full': [
    es('No es ideal.'),
    en('Perfect.')
  ],
  'turn-47-full': [
    es('Fatal.'),
    en('Good.')
  ],
  'turn-50-full': [
    es('Colonial.'),
    en('Good.')
  ],
  'turn-53-full': [
    es('Cultural.'),
    en('Yes, and perfect Spanish accent.'),
    es('Cultural.'),
    en('Very nice.')
  ],
  'turn-56-full': [
    es('Anual.'),
    en('Very nice.')
  ],
  'turn-59-full': [
    es('Dental.'),
    en('Good. Tooth in Spanish is'),
    es('diente.'),
    en('So this is coming from dental. If you look up tooth in the dictionary and find'),
    es('diente,'),
    en('rather than treating it as random vocabulary to memorize, you can relate it back to dental.')
  ],
  'turn-62-full': [
    es('Verbal.'),
    en("Good. So if we wanted to say 'verb', we can guess that verb is probably going to be similar in Spanish.")
  ],
  'turn-65-full': [
    es('Verbo.'),
    en("Good. With vocabulary, we can happily guess and try. If we said 'verb' and they look at us funny and say 'ah,"),
    es("verbo!"),
    en("', then we learn. It's the best way to learn quickly.")
  ]
};
