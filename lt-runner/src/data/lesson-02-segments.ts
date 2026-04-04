import type { SpeechSegment } from '@/types/lesson';

const en = (text: string): SpeechSegment => ({ text, lang: 'en' });
const es = (text: string): SpeechSegment => ({ text, lang: 'es' });

export const lesson02Segments: Record<string, SpeechSegment[]> = {
  'turn-3-full': [
    en('One of these rules is that words ending in A-L tend to come from Latin so we can make them Spanish. For example, normal in Spanish is'),
    es('normál,'),
    en('but we stress the end:'),
    es('normál.')
  ],
  'turn-6-full': [
    es('Metál.'),
    en('Good. To get a perfect accent in Spanish we just need to pronounce all of the vowels exactly as they are written. A, E, I, O, U in Spanish is ah, eh, ee, oh, oo.')
  ],
  'turn-7-full': [
    en("The word for 'is' in Spanish is"),
    es('és.'),
    en("E-S. And this also means 'it is', 'she is', 'he is', or even 'you are' when talking to somebody formally.")
  ],
  'turn-10-full': [
    es('És normál.'),
    en("And you pronounce the S, which is excellent. English speakers should be aware that maybe they feel themselves pronouncing a Z because many times we have an S in English like in the word 'is' and we pronounce a Z. Be careful to pronounce an S.")
  ],
  'turn-13-reveal': [
    es('Legál.'),
    en('Good.')
  ],
  'turn-15-full': [
    es('És legál.'),
    en('Good.')
  ],
  'turn-18-full': [
    es('Ilegál.'),
    en("Good. In Spanish the I is like 'ink' and the E is like 'elephant'."),
    es('Ilegál.')
  ],
  'turn-21-full': [
    es('És ilegál.'),
    en('Good.')
  ],
  'turn-22-full': [
    en("What if you want to say 'he is liberal'? You do not need the word for 'he' if you know who you are talking about. You can just use"),
    es('és.'),
    en('How would you say it?')
  ],
  'turn-24-full': [
    es('És liberál.'),
    en('Good.')
  ],
  'turn-28-full': [
    es('Naturál.'),
    en('Very good. You pronounce a T, A is like ah, U is like oo.'),
    es('Naturál.'),
    en('And the accent on the end as well.')
  ],
  'turn-29-full': [
    en("If you want to say 'it isn't' or 'it's not', the word for 'not' or 'don't' is the same as the word for 'no'. And the word for 'no' in Spanish is the same as English, but you pronounce it like Spanish:"),
    es('nó.')
  ],
  'turn-30-full': [
    en("You put this before"),
    es("'és'"),
    en("if you want to say 'it is not'. How would that sound? How would you say 'it is not'?")
  ],
  'turn-32-full': [
    es('Nó és.'),
    en("Good. So now we can say things like 'it's not normal'.")
  ],
  'turn-35-full': [
    es('Nó és normál.'),
    en('Good.')
  ],
  'turn-38-full': [
    es('Ideál.'),
    en('Good.')
  ],
  'turn-41-full': [
    es('És ideál.'),
    en('Good.')
  ],
  'turn-44-full': [
    es('Nó és ideál.'),
    en('Perfect.')
  ],
  'turn-47-full': [
    es('Fatál.'),
    en('Good.')
  ],
  'turn-50-full': [
    es('Coloniál.'),
    en('Good.')
  ],
  'turn-53-full': [
    es('Culturál.'),
    en('Yes, and perfect Spanish accent.'),
    es('Culturál.'),
    en('Very nice.')
  ],
  'turn-56-full': [
    es('Anuál.'),
    en('Very nice.')
  ],
  'turn-59-full': [
    es('Dentál.'),
    en('Good. Tooth in Spanish is'),
    es('dién-té.'),
    en('So this is coming from dental. If you look up tooth in the dictionary and find'),
    es('dién-té,'),
    en('rather than treating it as random vocabulary to memorize, you can relate it back to dental.')
  ],
  'turn-62-full': [
    es('Verbál.'),
    en("Good. So if we wanted to say 'verb', we can guess that verb is probably going to be similar in Spanish.")
  ],
  'turn-65-full': [
    es('Vérbo.'),
    en("Good. With vocabulary, we can happily guess and try. If we said 'verb' and they look at us funny and say 'ah,"),
    es("vérbo!"),
    en("', then we learn. It's the best way to learn quickly.")
  ]
};
